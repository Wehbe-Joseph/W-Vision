import { Router } from "express";
import { db } from "@workspace/db";
import {
  toursTable,
  tourPhotosTable,
  tourViewsTable,
  profilesTable,
} from "@workspace/db";
import { eq, and, desc, asc, ilike, count, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  CreateTourBody,
  ListToursQueryParams,
  SetTourFloorCountBody,
  UpdateTourRoomFloorsBody,
} from "@workspace/api-zod";

const router = Router();

const TOUR_LIMITS: Record<string, number> = {
  free: 1,
  pro: 15,
  unlimited: 30,
};

function generateShareToken() {
  return randomBytes(12).toString("hex");
}

function mapTour(t: typeof toursTable.$inferSelect) {
  return {
    id: t.id,
    userId: t.userId,
    listingUrl: t.listingUrl,
    listingTitle: t.listingTitle,
    listingAddress: t.listingAddress,
    listingPlatform: t.listingPlatform,
    listingPrice: t.listingPrice,
    listingBedrooms: t.listingBedrooms,
    listingBathrooms: t.listingBathrooms,
    listingSqft: t.listingSqft,
    status: t.status,
    currentStage: t.currentStage,
    totalPhotosExtracted: t.totalPhotosExtracted,
    photosUsed: t.photosUsed,
    roomsDetected: t.roomsDetected,
    floorCount: t.floorCount,
    confidenceScore: t.confidenceScore,
    realAngles: t.realAngles,
    aiHighAngles: t.aiHighAngles,
    aiLowAngles: t.aiLowAngles,
    marbleWorldIds: t.marbleWorldIds,
    tourEmbedUrl: t.tourEmbedUrl,
    shareToken: t.shareToken,
    isWatermarked: t.isWatermarked,
    thumbnailUrl: t.thumbnailUrl,
    viewCount: t.viewCount,
    errorMessage: t.errorMessage,
    generationStatus: t.generationStatus,
    worldlabsJobId: t.worldlabsJobId,
    generatedTourUrl: t.generatedTourUrl,
    previewImageUrl: t.previewImageUrl,
    processingStartedAt: t.processingStartedAt?.toISOString() ?? null,
    processingCompletedAt: t.processingCompletedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

function mapRoom(p: typeof tourPhotosTable.$inferSelect) {
  return {
    id: p.id,
    tourId: p.tourId,
    roomLabel: p.roomLabel,
    floorNumber: p.floorNumber,
    qualityScore: p.qualityScore,
    isSelected: p.isSelected,
    isBestForRoom: p.isBestForRoom,
    confidenceScore: p.confidenceScore,
    marbleWorldId: p.marbleWorldId,
    marbleEmbedUrl: p.marbleEmbedUrl,
    thumbnailUrl: p.thumbnailUrl,
    isAiGenerated: p.isAiGenerated,
    createdAt: p.createdAt.toISOString(),
  };
}

// POST /tours — create tour
router.post("/tours", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = CreateTourBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, userId),
    });

    if (profile) {
      const tier = profile.subscriptionTier || "free";
      const limit = TOUR_LIMITS[tier] ?? 1;
      if (profile.toursThisMonth >= limit) {
        return res.status(403).json({
          error: `Tour limit reached. Upgrade to generate more tours.`,
          code: "LIMIT_REACHED",
        });
      }
    }

    const shareToken = generateShareToken();
    const listingUrl = parsed.data.listingUrl;
    const platform = listingUrl.includes("zillow")
      ? "zillow"
      : listingUrl.includes("airbnb")
      ? "airbnb"
      : listingUrl.includes("bayut")
      ? "bayut"
      : listingUrl.includes("propertyfinder")
      ? "property_finder"
      : "other";

    const [tour] = await db
      .insert(toursTable)
      .values({
        userId,
        listingUrl,
        listingPlatform: platform,
        listingAddress: "Property at " + listingUrl.split("/")[2],
        status: "pending",
        shareToken,
        floorCount: parsed.data.floorCount ?? 1,
        isWatermarked: true,
        processingStartedAt: new Date(),
      })
      .returning();

    // Simulate processing — create demo rooms
    await simulateTourProcessing(tour.id);

    return res.json({ tourId: tour.id, shareToken: tour.shareToken! });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

async function simulateTourProcessing(tourId: string) {
  const rooms = [
    { label: "Living Room", floor: 1, quality: 5, confidence: 0.95, isReal: true },
    { label: "Kitchen", floor: 1, quality: 4, confidence: 0.88, isReal: true },
    { label: "Master Bedroom", floor: 2, quality: 5, confidence: 0.92, isReal: true },
    { label: "Bathroom", floor: 1, quality: 3, confidence: 0.65, isReal: false },
    { label: "Bedroom 2", floor: 2, quality: 4, confidence: 0.78, isReal: false },
    { label: "Balcony", floor: 2, quality: 4, confidence: 0.82, isReal: true },
  ];

  const roomInserts = rooms.map((r, i) => ({
    tourId,
    roomLabel: r.label,
    floorNumber: r.floor,
    qualityScore: r.quality,
    isSelected: true,
    isBestForRoom: true,
    isAiGenerated: !r.isReal,
    confidenceScore: r.confidence,
    marbleWorldId: `world_${tourId}_${i}`,
    marbleEmbedUrl: null,
    thumbnailUrl: `https://images.unsplash.com/photo-${1560000000 + i * 100000}?w=400&q=60`,
  }));

  await db.insert(tourPhotosTable).values(roomInserts);

  const realCount = rooms.filter((r) => r.isReal).length;
  const aiHighCount = rooms.filter((r) => !r.isReal && r.confidence > 0.6).length;
  const aiLowCount = rooms.filter((r) => !r.isReal && r.confidence <= 0.6).length;

  await db
    .update(toursTable)
    .set({
      status: "ready",
      roomsDetected: rooms.length,
      totalPhotosExtracted: rooms.length * 3,
      photosUsed: rooms.length,
      realAngles: realCount,
      aiHighAngles: aiHighCount,
      aiLowAngles: aiLowCount,
      confidenceScore: (realCount / rooms.length) * 100,
      processingCompletedAt: new Date(),
      listingBedrooms: 3,
      listingBathrooms: 2,
      listingSqft: "1,850",
      thumbnailUrl: "https://images.unsplash.com/photo-1560184897-ae75f418493e?w=800&q=60",
    })
    .where(eq(toursTable.id, tourId));

  await db
    .update(profilesTable)
    .set({
      toursThisMonth: sql`tours_this_month + 1`,
      totalTours: sql`total_tours + 1`,
    })
    .where(eq(profilesTable.id, (await db.query.toursTable.findFirst({ where: eq(toursTable.id, tourId) }))!.userId));
}

// GET /tours — list tours
router.get("/tours", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = ListToursQueryParams.safeParse(req.query);
    const params = parsed.success ? parsed.data : {};

    const page = params.page ?? 1;
    const limit = params.limit ?? 12;
    const offset = (page - 1) * limit;

    let query = db
      .select()
      .from(toursTable)
      .where(
        and(
          eq(toursTable.userId, userId),
          params.status && params.status !== "all"
            ? eq(toursTable.status, params.status)
            : undefined,
          params.search
            ? ilike(toursTable.listingAddress, `%${params.search}%`)
            : undefined
        )
      )
      .limit(limit)
      .offset(offset);

    if (params.sort === "oldest") {
      query = query.orderBy(asc(toursTable.createdAt)) as typeof query;
    } else {
      query = query.orderBy(desc(toursTable.createdAt)) as typeof query;
    }

    const tours = await query;
    const [{ total }] = await db
      .select({ total: count() })
      .from(toursTable)
      .where(eq(toursTable.userId, userId));

    return res.json({
      tours: tours.map(mapTour),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /tours/recent
router.get("/tours/recent", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const tours = await db
      .select()
      .from(toursTable)
      .where(eq(toursTable.userId, userId))
      .orderBy(desc(toursTable.createdAt))
      .limit(5);

    return res.json({ tours: tours.map(mapTour), total: tours.length });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /tours/stats
router.get("/tours/stats", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, userId),
    });

    const tier = profile?.subscriptionTier || "free";
    const limit = TOUR_LIMITS[tier] ?? 1;

    const allTours = await db
      .select()
      .from(toursTable)
      .where(eq(toursTable.userId, userId));

    const totalViews = allTours.reduce((s, t) => s + t.viewCount, 0);

    return res.json({
      toursThisMonth: profile?.toursThisMonth ?? 0,
      toursLimit: limit,
      avgProcessingMinutes: 24,
      totalViewsThisMonth: totalViews,
      totalToursAllTime: profile?.totalTours ?? 0,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /tours/:tourId
router.get("/tours/:tourId", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const tour = await db.query.toursTable.findFirst({
      where: and(eq(toursTable.id, req.params.tourId), eq(toursTable.userId, userId)),
    });

    if (!tour) return res.status(404).json({ error: "Tour not found" });

    return res.json(mapTour(tour));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /tours/:tourId
router.delete("/tours/:tourId", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await db
      .delete(toursTable)
      .where(and(eq(toursTable.id, req.params.tourId), eq(toursTable.userId, userId)));

    return res.json({ success: true, message: "Tour deleted" });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /tours/:tourId/status
router.get("/tours/:tourId/status", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const tour = await db.query.toursTable.findFirst({
      where: and(eq(toursTable.id, req.params.tourId), eq(toursTable.userId, userId)),
    });

    if (!tour) return res.status(404).json({ error: "Tour not found" });

    const rooms = await db
      .select()
      .from(tourPhotosTable)
      .where(and(eq(tourPhotosTable.tourId, tour.id), eq(tourPhotosTable.isBestForRoom, true)));

    const estimatedMinutes: Record<string, number> = {
      queued: 5,
      processing: 3,
      completed: 0,
      failed: 0,
    };
    const genStatus = tour.generationStatus ?? "queued";

    return res.json({
      status: tour.status,
      generationStatus: genStatus,
      currentStage: tour.currentStage,
      roomsCompleted: rooms.filter((r) => r.marbleWorldId).length,
      roomsTotal: tour.roomsDetected || rooms.length,
      estimatedMinutes: estimatedMinutes[genStatus] ?? 3,
      confidenceScore: tour.confidenceScore,
      errorMessage: tour.errorMessage,
      generatedTourUrl: tour.generatedTourUrl,
      previewImageUrl: tour.previewImageUrl ?? tour.thumbnailUrl,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /tours/:tourId/rooms
router.get("/tours/:tourId/rooms", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const tour = await db.query.toursTable.findFirst({
      where: and(eq(toursTable.id, req.params.tourId), eq(toursTable.userId, userId)),
    });

    if (!tour) return res.status(404).json({ error: "Tour not found" });

    const rooms = await db
      .select()
      .from(tourPhotosTable)
      .where(and(eq(tourPhotosTable.tourId, tour.id), eq(tourPhotosTable.isBestForRoom, true)))
      .orderBy(asc(tourPhotosTable.floorNumber));

    return res.json({ rooms: rooms.map(mapRoom), floorCount: tour.floorCount });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /tours/:tourId/rooms — update floor assignments
router.put("/tours/:tourId/rooms", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = UpdateTourRoomFloorsBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    for (const assignment of parsed.data.assignments) {
      await db
        .update(tourPhotosTable)
        .set({ floorNumber: assignment.floorNumber })
        .where(eq(tourPhotosTable.id, assignment.roomId));
    }

    return res.json({ success: true, message: "Floor assignments updated" });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /tours/:tourId/floors
router.put("/tours/:tourId/floors", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = SetTourFloorCountBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    await db
      .update(toursTable)
      .set({ floorCount: parsed.data.floorCount })
      .where(and(eq(toursTable.id, req.params.tourId), eq(toursTable.userId, userId)));

    return res.json({ success: true, message: "Floor count set" });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /tours/public/:shareToken — public, no auth
router.get("/tours/public/:shareToken", async (req, res) => {
  try {
    const tour = await db.query.toursTable.findFirst({
      where: eq(toursTable.shareToken, req.params.shareToken),
    });

    if (!tour) return res.status(404).json({ error: "Tour not found" });

    // Increment view count
    await db
      .update(toursTable)
      .set({ viewCount: sql`view_count + 1` })
      .where(eq(toursTable.id, tour.id));

    // Log view
    const ip = req.ip || "unknown";
    await db.insert(tourViewsTable).values({
      tourId: tour.id,
      viewerIp: ip,
      country: "Unknown",
      deviceType: req.headers["user-agent"]?.includes("Mobile") ? "mobile" : "desktop",
      browser: "browser",
    });

    const rooms = await db
      .select()
      .from(tourPhotosTable)
      .where(and(eq(tourPhotosTable.tourId, tour.id), eq(tourPhotosTable.isBestForRoom, true)))
      .orderBy(asc(tourPhotosTable.floorNumber));

    const agent = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, tour.userId),
    });

    return res.json({
      id: tour.id,
      shareToken: tour.shareToken,
      listingAddress: tour.listingAddress,
      listingPlatform: tour.listingPlatform,
      listingPrice: tour.listingPrice,
      listingBedrooms: tour.listingBedrooms,
      listingBathrooms: tour.listingBathrooms,
      listingSqft: tour.listingSqft,
      marbleWorldIds: tour.marbleWorldIds,
      rooms: rooms.map(mapRoom),
      confidenceScore: tour.confidenceScore,
      realAngles: tour.realAngles,
      aiHighAngles: tour.aiHighAngles,
      aiLowAngles: tour.aiLowAngles,
      isWatermarked: tour.isWatermarked,
      agentName: agent?.fullName ?? null,
      agentLogo: agent?.avatarUrl ?? null,
      thumbnailUrl: tour.thumbnailUrl,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
