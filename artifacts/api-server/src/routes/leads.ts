import { Router } from "express";
import { db } from "@workspace/db";
import { buyerLeadsTable, toursTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { SubmitBuyerLeadBody } from "@workspace/api-zod";
import type { Request, Response } from "express";

const router = Router();

const LEAD_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const LEAD_LIMIT_PER_IP_PER_TOUR = 3;
const LEAD_RATE_LIMIT = new Map<string, number[]>();

function getClientIp(raw: string | undefined): string {
  if (!raw) return "unknown";
  const first = raw.split(",")[0]?.trim();
  return first || "unknown";
}

async function submitLead(
  req: Request,
  res: Response,
  tourId: string,
  body: unknown,
) {
  try {
    const parsed = SubmitBuyerLeadBody.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    let tour: typeof toursTable.$inferSelect | undefined;
    try {
      tour = await db.query.toursTable.findFirst({
        where: eq(toursTable.id, tourId),
      });
    } catch (err) {
      req.log.warn({ err, tourId }, "Lead submit tour lookup failed");
      return res.status(503).json({
        error: "Tour data is temporarily unavailable. Please try again soon.",
      });
    }

    if (!tour) return res.status(404).json({ error: "Tour not found" });

    const clientIp = getClientIp(req.ip);
    const rateKey = `${tourId}:${clientIp}`;
    const now = Date.now();
    const recent = (LEAD_RATE_LIMIT.get(rateKey) ?? []).filter(
      (ts) => now - ts < LEAD_WINDOW_MS,
    );
    if (recent.length >= LEAD_LIMIT_PER_IP_PER_TOUR) {
      return res.status(429).json({
        error: "Rate limit exceeded. Try again in about an hour.",
      });
    }
    recent.push(now);
    LEAD_RATE_LIMIT.set(rateKey, recent);

    await db.insert(buyerLeadsTable).values({
      tourId,
      agentId: tour.userId,
      buyerName: parsed.data.name,
      buyerEmail: parsed.data.email,
      buyerPhone: parsed.data.phone ?? undefined,
      message: parsed.data.message ?? undefined,
      status: "new",
    });

    return res.json({ success: true, message: "Lead submitted" });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// POST /tours/:tourId/lead — public
router.post("/tours/:tourId/lead", async (req, res) => {
  return submitLead(req, res, req.params.tourId, req.body);
});

// POST /tours/lead — public alias (body carries tour_id)
router.post("/tours/lead", async (req, res) => {
  const body = req.body as {
    tour_id?: string;
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
  };
  if (!body.tour_id) {
    return res.status(400).json({ error: "tour_id is required" });
  }
  return submitLead(req, res, body.tour_id, {
    name: body.name,
    email: body.email,
    phone: body.phone,
    message: body.message,
  });
});

// GET /leads
router.get("/leads", async (req, res) => {
  try {
    const userId = (req.user as { profileId?: string } | undefined)?.profileId ?? (req.headers["x-user-id"] as string | undefined);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const leads = await db
      .select({
        id: buyerLeadsTable.id,
        tourId: buyerLeadsTable.tourId,
        buyerName: buyerLeadsTable.buyerName,
        buyerEmail: buyerLeadsTable.buyerEmail,
        buyerPhone: buyerLeadsTable.buyerPhone,
        message: buyerLeadsTable.message,
        status: buyerLeadsTable.status,
        tourAddress: toursTable.listingAddress,
        createdAt: buyerLeadsTable.createdAt,
      })
      .from(buyerLeadsTable)
      .leftJoin(toursTable, eq(buyerLeadsTable.tourId, toursTable.id))
      .where(eq(buyerLeadsTable.agentId, userId))
      .orderBy(desc(buyerLeadsTable.createdAt));

    return res.json({
      leads: leads.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
      total: leads.length,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
