import { Router } from "express";
import { db } from "@workspace/db";
import { toursTable, buyerLeadsTable, tourViewsTable } from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";
import {
  listMemToursForUser,
  memAvgProcessingMinutesForUser,
} from "../lib/tourMemoryStore";

const router = Router();

interface AnalyticsTour {
  id: string;
  listingAddress: string | null;
  viewCount: number;
  createdAt: Date;
}

router.get("/analytics/overview", async (req, res) => {
  const userId =
    (req.user as { profileId?: string } | undefined)?.profileId ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  let tours: AnalyticsTour[] = [];
  let viewsByCountry: { country: string; views: number; percentage: number }[] = [];
  let processingTrend: { date: string; avgMinutes: number }[] = [];
  let tourPerformance: {
    tourId: string;
    address: string;
    views: number;
    countries: number;
    avgTimeInTour: number | null;
    leads: number;
  }[] = [];

  let dbAvailable = true;
  try {
    const dbTours = await db
      .select()
      .from(toursTable)
      .where(eq(toursTable.userId, userId))
      .orderBy(desc(toursTable.createdAt))
      .limit(50);
    tours = dbTours.map((t) => ({
      id: t.id,
      listingAddress: t.listingAddress,
      viewCount: t.viewCount,
      createdAt: t.createdAt,
    }));
  } catch (err) {
    dbAvailable = false;
    req.log.warn({ err }, "Analytics DB lookup failed — using memory store");
    tours = listMemToursForUser(userId).map((t) => ({
      id: t.tourId,
      listingAddress: t.listingAddress,
      viewCount: t.viewCount,
      createdAt: new Date(t.createdAt),
    }));
  }

  // Tours over the last 30 days
  const toursOverTime: { date: string; count: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayTours = tours.filter(
      (t) => t.createdAt.toISOString().split("T")[0] === dateStr,
    );
    toursOverTime.push({ date: dateStr, count: dayTours.length });
  }

  // Views per tour (top 10) — purely from real view counts
  const viewsByTour = [...tours]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 10)
    .map((t) => ({
      tourId: t.id,
      address: t.listingAddress || "Unknown Property",
      views: t.viewCount,
    }));

  // Real viewer countries from the tour_views table (only if DB works).
  if (dbAvailable) {
    try {
      const tourIds = tours.map((t) => t.id);
      if (tourIds.length > 0) {
        const rows = await db
          .select({
            country: tourViewsTable.country,
            views: count(),
          })
          .from(tourViewsTable)
          .where(
            sql`${tourViewsTable.tourId} = ANY(ARRAY[${sql.join(
              tourIds.map((id) => sql`${id}`),
              sql`,`,
            )}]::uuid[])`,
          )
          .groupBy(tourViewsTable.country);

        const totalViews = rows.reduce((s, r) => s + Number(r.views), 0);
        viewsByCountry = rows
          .map((r) => ({
            country: r.country || "Unknown",
            views: Number(r.views),
            percentage:
              totalViews > 0
                ? Math.round((Number(r.views) / totalViews) * 100)
                : 0,
          }))
          .sort((a, b) => b.views - a.views)
          .slice(0, 8);
      }
    } catch (err) {
      req.log.warn({ err }, "Failed to aggregate viewsByCountry");
    }
  }

  // Real average processing time per day from the memory store
  const avgMinutes = memAvgProcessingMinutesForUser(userId);
  processingTrend = toursOverTime.map((d) => ({
    date: d.date,
    avgMinutes,
  }));

  // Per-tour performance with real lead counts when DB is available
  tourPerformance = await Promise.all(
    tours.slice(0, 20).map(async (t) => {
      let leads = 0;
      if (dbAvailable) {
        try {
          const [row] = await db
            .select({ cnt: count() })
            .from(buyerLeadsTable)
            .where(eq(buyerLeadsTable.tourId, t.id));
          leads = row?.cnt ?? 0;
        } catch {
          // ignore
        }
      }
      return {
        tourId: t.id,
        address: t.listingAddress || "Unknown Property",
        views: t.viewCount,
        countries: viewsByCountry.length || 0,
        avgTimeInTour: null,
        leads,
      };
    }),
  );

  return res.json({
    toursOverTime,
    viewsByTour,
    viewsByCountry,
    processingTrend,
    tourPerformance,
  });
});

export default router;
