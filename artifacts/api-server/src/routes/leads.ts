import { Router } from "express";
import { db } from "@workspace/db";
import { buyerLeadsTable, toursTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { SubmitBuyerLeadBody } from "@workspace/api-zod";

const router = Router();

// POST /tours/:tourId/lead — public
router.post("/tours/:tourId/lead", async (req, res) => {
  try {
    const parsed = SubmitBuyerLeadBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const tour = await db.query.toursTable.findFirst({
      where: eq(toursTable.id, req.params.tourId),
    });

    if (!tour) return res.status(404).json({ error: "Tour not found" });

    await db.insert(buyerLeadsTable).values({
      tourId: req.params.tourId,
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
});

// GET /leads
router.get("/leads", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
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
