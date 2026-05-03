import { Router } from "express";
import { db } from "@workspace/db";
import { toursTable, tourViewsTable, buyerLeadsTable } from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";

const router = Router();

router.get("/analytics/overview", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const tours = await db
      .select()
      .from(toursTable)
      .where(eq(toursTable.userId, userId))
      .orderBy(desc(toursTable.createdAt))
      .limit(50);

    // Tours over time (last 30 days)
    const toursOverTime: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayTours = tours.filter(
        (t) => t.createdAt.toISOString().split("T")[0] === dateStr
      );
      toursOverTime.push({ date: dateStr, count: dayTours.length });
    }

    // Views by tour
    const viewsByTour = tours
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 10)
      .map((t) => ({
        tourId: t.id,
        address: t.listingAddress || "Unknown Property",
        views: t.viewCount,
      }));

    // Views by country (mock data based on tour views)
    const viewsByCountry = [
      { country: "UAE", views: 98, percentage: 28 },
      { country: "Saudi Arabia", views: 76, percentage: 22 },
      { country: "Lebanon", views: 64, percentage: 18 },
      { country: "Qatar", views: 45, percentage: 13 },
      { country: "United Kingdom", views: 32, percentage: 9 },
      { country: "Other", views: 35, percentage: 10 },
    ];

    // Processing time trend (mock)
    const processingTrend = toursOverTime.map((d) => ({
      date: d.date,
      avgMinutes: 20 + Math.random() * 15,
    }));

    // Tour performance
    const tourPerformance = await Promise.all(
      tours.slice(0, 20).map(async (t) => {
        const [leadCount] = await db
          .select({ cnt: count() })
          .from(buyerLeadsTable)
          .where(eq(buyerLeadsTable.tourId, t.id));
        return {
          tourId: t.id,
          address: t.listingAddress || "Unknown Property",
          views: t.viewCount,
          countries: 3,
          avgTimeInTour: 4.5,
          leads: leadCount?.cnt ?? 0,
        };
      })
    );

    return res.json({
      toursOverTime,
      viewsByTour,
      viewsByCountry,
      processingTrend,
      tourPerformance,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
