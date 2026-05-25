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
import {
  listMemToursForUser,
  getMemTour,
  deleteMemTour,
  memTourCountThisMonthForUser,
  memTotalToursForUser,
  memAvgProcessingMinutesForUser,
  memTotalViewsForUser,
  findMemTourByShareToken,
  refreshTourExpiry,
  type MemTour,
  type MemScene,
} from "../lib/tourMemoryStore";
import { mapDbScenesToPublicLike } from "../lib/tourScenesPersistence";
import { FREE_TIER_TTL_MS } from "../lib/userMemoryStore";

const router = Router();

const TOUR_LIMITS: Record<string, number> = {
  free: 1,
  pro: 15,
  unlimited: 30,
};

function mapMemTour(t: MemTour) {
  refreshTourExpiry(t);
  const status =
    t.frozen
      ? "frozen"
      : t.generationStatus === "completed"
        ? "ready"
        : t.generationStatus === "failed"
          ? "failed"
          : "processing";
  return {
    id: t.tourId,
    userId: t.userId,
    listingUrl: t.listingUrl,
    listingTitle: null,
    listingAddress: t.listingAddress,
    listingPlatform: t.listingPlatform,
    listingPrice: null,
    listingBedrooms: null,
    listingBathrooms: null,
    listingSqft: null,
    status,
    currentStage: t.currentStage,
    totalPhotosExtracted: t.imageCount,
    photosUsed: t.imageCount,
    roomsDetected: null,
    floorCount: 1,
    confidenceScore: null,
    realAngles: null,
    aiHighAngles: null,
    aiLowAngles: null,
    marbleWorldIds: null,
    tourEmbedUrl: t.frozen ? null : t.previewImageUrl,
    shareToken: t.shareToken,
    isWatermarked: true,
    thumbnailUrl: t.previewImageUrl,
    viewCount: t.viewCount,
    errorMessage: t.errorMessage,
    generationStatus: t.generationStatus,
    worldlabsJobId: null,
    generatedTourUrl: t.frozen ? null : t.previewImageUrl,
    previewImageUrl: t.previewImageUrl,
    processingStartedAt: new Date(t.createdAt).toISOString(),
    processingCompletedAt: t.completedAt
      ? new Date(t.completedAt).toISOString()
      : null,
    createdAt: new Date(t.createdAt).toISOString(),
    frozen: t.frozen,
    expiresAt: t.expiresAt ? new Date(t.expiresAt).toISOString() : null,
    createdOnTier: t.createdOnTier,
  };
}

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

function mapPublicScene(s: MemScene) {
  return {
    id: s.id,
    label: s.label,
    roomType: s.roomType,
    thumbnailUrl: s.thumbnailUrl,
    imageCount: s.imageUrls.length,
    generationStatus: s.generationStatus,
    generatedTourUrl: s.thumbnailUrl,
    worldEmbedUrl: s.thumbnailUrl,
    worldId: null,
    locked: s.locked,
  };
}

/** Scenes for share link once memory is gone — read from Postgres JSON. */
function mapDbStoredScenesToPublic(raw: unknown) {
  return mapDbScenesToPublicLike(raw).map((s) => ({
    id: s.id,
    label: s.label,
    roomType: s.roomType,
    thumbnailUrl: s.thumbnailUrl,
    imageCount: s.imageCount,
    generationStatus: s.generationStatus,
    generatedTourUrl: s.thumbnailUrl,
    worldEmbedUrl: s.thumbnailUrl,
    worldId: null,
    locked: s.locked,
  }));
}

function mapRoom(p: typeof tourPhotosTable.$inferSelect) {
  return {
    id: p.id,
    tourId: p.tourId,
    roomLabel: p.roomLabel,
    roomType: p.roomLabel,
    floorNumber: p.floorNumber,
    qualityScore: p.qualityScore,
    isSelected: p.isSelected,
    isBestForRoom: p.isBestForRoom,
    confidenceScore: p.confidenceScore,
    panoramaUrl: p.panoramaUrl ?? null,
    panoramaStatus: p.panoramaStatus ?? "pending",
    thumbnailUrl: p.thumbnailUrl,
    isAiGenerated: p.isAiGenerated,
    createdAt: p.createdAt.toISOString(),
  };
}

// POST /tours — create tour
router.post("/tours", async (req, res) => {
  try {
    const userId = (req.user as { profileId?: string } | undefined)?.profileId ?? (req.headers["x-user-id"] as string | undefined);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = CreateTourBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, userId),
    });

    if (profile) {
      const tier = profile.subscriptionTier || "free";
      const limit = TOUR_LIMITS[tier] ?? 1;
      const used =
        tier === "free"
          ? profile.totalTours ?? profile.toursThisMonth
          : profile.toursThisMonth;
      if (used >= limit) {
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
  const userId =
    (req.user as { profileId?: string } | undefined)?.profileId ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const parsed = ListToursQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};
  const page = params.page ?? 1;
  const limit = params.limit ?? 12;
  const offset = (page - 1) * limit;

  try {
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
            : undefined,
        ),
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
    req.log.warn({ err }, "DB list tours failed — using in-memory store");
    const all = listMemToursForUser(userId, {
      status: params.status as "all" | "ready" | "processing" | "failed" | undefined,
      search: params.search,
    });
    const total = all.length;
    const page1 = all.slice(offset, offset + limit).map(mapMemTour);
    return res.json({
      tours: page1,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }
});

// GET /tours/recent
router.get("/tours/recent", async (req, res) => {
  const userId =
    (req.user as { profileId?: string } | undefined)?.profileId ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const tours = await db
      .select()
      .from(toursTable)
      .where(eq(toursTable.userId, userId))
      .orderBy(desc(toursTable.createdAt))
      .limit(5);

    return res.json({ tours: tours.map(mapTour), total: tours.length });
  } catch (err) {
    req.log.warn({ err }, "DB recent tours failed — using in-memory store");
    const recent = listMemToursForUser(userId).slice(0, 5).map(mapMemTour);
    return res.json({ tours: recent, total: recent.length });
  }
});

// GET /tours/stats
router.get("/tours/stats", async (req, res) => {
  const userId =
    (req.user as { profileId?: string } | undefined)?.profileId ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  let tier = "free";
  let toursThisMonth: number | null = null;
  let totalToursAllTime: number | null = null;
  let totalViewsThisMonth: number | null = null;
  let avgProcessingMinutes = 0;

  try {
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, userId),
    });
    tier = profile?.subscriptionTier || "free";
    toursThisMonth = profile?.toursThisMonth ?? null;
    totalToursAllTime = profile?.totalTours ?? null;

    const allTours = await db
      .select()
      .from(toursTable)
      .where(eq(toursTable.userId, userId));
    totalViewsThisMonth = allTours.reduce((s, t) => s + t.viewCount, 0);
  } catch (err) {
    req.log.warn({ err }, "DB stats lookup failed — using in-memory store");
  }

  // Always merge in the in-memory store — DB profile counters lag behind
  // realtime generation, and when the DB is offline they're missing entirely.
  const memCountMonth = memTourCountThisMonthForUser(userId);
  const memTotal = memTotalToursForUser(userId);
  const memViews = memTotalViewsForUser(userId);
  const memAvg = memAvgProcessingMinutesForUser(userId);

  const finalToursThisMonth = Math.max(toursThisMonth ?? 0, memCountMonth);
  const finalTotal = Math.max(totalToursAllTime ?? 0, memTotal);
  const finalViews = Math.max(totalViewsThisMonth ?? 0, memViews);
  avgProcessingMinutes = memAvg;

  const limit = TOUR_LIMITS[tier] ?? 1;

  return res.json({
    toursThisMonth: finalToursThisMonth,
    toursLimit: limit,
    avgProcessingMinutes,
    totalViewsThisMonth: finalViews,
    totalToursAllTime: finalTotal,
  });
});

// GET /tours/:tourId
router.get("/tours/:tourId", async (req, res) => {
  const userId =
    (req.user as { profileId?: string } | undefined)?.profileId ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const tour = await db.query.toursTable.findFirst({
      where: and(
        eq(toursTable.id, req.params.tourId),
        eq(toursTable.userId, userId),
      ),
    });
    if (tour) return res.json(mapTour(tour));
  } catch (err) {
    req.log.warn({ err }, "DB tour lookup failed — using in-memory store");
  }

  const mem = getMemTour(req.params.tourId);
  if (!mem || mem.userId !== userId) {
    return res.status(404).json({ error: "Tour not found" });
  }
  return res.json(mapMemTour(mem));
});

// DELETE /tours/:tourId
router.delete("/tours/:tourId", async (req, res) => {
  const userId =
    (req.user as { profileId?: string } | undefined)?.profileId ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  let dbDeleted = false;
  try {
    await db
      .delete(toursTable)
      .where(
        and(
          eq(toursTable.id, req.params.tourId),
          eq(toursTable.userId, userId),
        ),
      );
    dbDeleted = true;
  } catch (err) {
    req.log.warn({ err }, "DB delete failed — clearing in-memory only");
  }

  // Always evict from memory too — otherwise the tour reappears in /tours.
  const mem = getMemTour(req.params.tourId);
  if (mem && mem.userId === userId) deleteMemTour(req.params.tourId);

  return res.json({
    success: true,
    message: dbDeleted ? "Tour deleted" : "Tour deleted (memory only)",
  });
});

// GET /tours/:tourId/status
router.get("/tours/:tourId/status", async (req, res) => {
  try {
    const userId = (req.user as { profileId?: string } | undefined)?.profileId ?? (req.headers["x-user-id"] as string | undefined);
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
      roomsCompleted: rooms.filter((r) => r.thumbnailUrl).length,
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
    const userId = (req.user as { profileId?: string } | undefined)?.profileId ?? (req.headers["x-user-id"] as string | undefined);
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
    const userId = (req.user as { profileId?: string } | undefined)?.profileId ?? (req.headers["x-user-id"] as string | undefined);
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
    const userId = (req.user as { profileId?: string } | undefined)?.profileId ?? (req.headers["x-user-id"] as string | undefined);
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
    const now = Date.now();
    let tour: typeof toursTable.$inferSelect | undefined;
    try {
      tour = await db.query.toursTable.findFirst({
        where: eq(toursTable.shareToken, req.params.shareToken),
      });
    } catch (err) {
      req.log.warn(
        { err, shareToken: req.params.shareToken },
        "DB public tour lookup failed — falling back to memory",
      );
    }

    if (!tour) {
      // Try memory fallback before 404
      const mem = findMemTourByShareToken(req.params.shareToken);
      if (mem) {
        refreshTourExpiry(mem);
        if (mem.frozen) {
          return res.status(410).json({
            error: "Tour is frozen",
            code: "TOUR_FROZEN",
            message:
              "This tour is no longer accessible. Generate a new tour to continue.",
            frozen: true,
            expiresAt: mem.expiresAt ? new Date(mem.expiresAt).toISOString() : null,
          });
        }
        mem.viewCount += 1;
        return res.json({
          id: mem.tourId,
          shareToken: mem.shareToken,
          listingAddress: mem.listingAddress,
          listingPlatform: mem.listingPlatform,
          listingPrice: null,
          listingBedrooms: null,
          listingBathrooms: null,
          listingSqft: null,
          marbleWorldIds: null,
          rooms: [],
          confidenceScore: null,
          realAngles: null,
          aiHighAngles: null,
          aiLowAngles: null,
          isWatermarked: true,
          agentName: null,
          agentLogo: null,
          thumbnailUrl: mem.previewImageUrl,
          generatedTourUrl: mem.previewImageUrl,
          generationStatus: mem.generationStatus,
          frozen: false,
          expiresAt: mem.expiresAt ? new Date(mem.expiresAt).toISOString() : null,
          createdOnTier: mem.createdOnTier,
          scenes: mem.scenes.map(mapPublicScene),
        });
      }
      return res.status(404).json({ error: "Tour not found" });
    }

    let rooms: (typeof tourPhotosTable.$inferSelect)[] = [];
    try {
      rooms = await db
        .select()
        .from(tourPhotosTable)
        .where(
          and(
            eq(tourPhotosTable.tourId, tour.id),
            eq(tourPhotosTable.isBestForRoom, true),
          ),
        )
        .orderBy(asc(tourPhotosTable.floorNumber));
    } catch (err) {
      req.log.warn({ err }, "Failed to load rooms — returning empty list");
    }

    const panoramaRooms = rooms.filter(
      (r) => r.panoramaStatus === "ready" && r.panoramaUrl,
    );

    let agent: typeof profilesTable.$inferSelect | undefined;
    try {
      agent = await db.query.profilesTable.findFirst({
        where: eq(profilesTable.id, tour.userId),
      });
    } catch {
      // agent metadata is optional in the response
    }

    // Consult the memory mirror for tier / expiry / scenes — these aren't
    // (yet) persisted to the DB schema.
    const mem = findMemTourByShareToken(req.params.shareToken);
    if (mem) refreshTourExpiry(mem);
    const ownerTier = ((agent?.subscriptionTier as string | null) ?? "free").toLowerCase();
    const ownerSubscriptionStatus = (
      (agent?.subscriptionStatus as string | null) ?? "inactive"
    ).toLowerCase();
    const ownerHasActivePaidAccess =
      ownerTier !== "free" && ownerSubscriptionStatus === "active";
    const dbDerivedExpiresAt =
      mem?.expiresAt ??
      (!ownerHasActivePaidAccess
        ? tour.createdAt.getTime() + FREE_TIER_TTL_MS
        : null);
    const frozen =
      mem?.frozen ??
      (dbDerivedExpiresAt !== null ? now >= dbDerivedExpiresAt : false);
    const expiresAt =
      dbDerivedExpiresAt !== null
        ? new Date(dbDerivedExpiresAt).toISOString()
        : null;
    const createdOnTier = mem?.createdOnTier ?? (ownerHasActivePaidAccess ? ownerTier : "free");

    if (frozen) {
      return res.status(410).json({
        error: "Tour is frozen",
        code: "TOUR_FROZEN",
        message:
          "This tour is no longer accessible. Generate a new tour to continue.",
        frozen: true,
        expiresAt,
      });
    }

    try {
      await db
        .update(toursTable)
        .set({ viewCount: sql`view_count + 1` })
        .where(eq(toursTable.id, tour.id));
      const ip = req.ip || "unknown";
      await db.insert(tourViewsTable).values({
        tourId: tour.id,
        viewerIp: ip,
        country: "Unknown",
        deviceType: req.headers["user-agent"]?.includes("Mobile")
          ? "mobile"
          : "desktop",
        browser: "browser",
      });
    } catch (err) {
      req.log.warn({ err }, "Failed to increment view counters");
    }

    const resolvedScenes = !frozen
      ? mem && mem.scenes.length > 0
        ? mem.scenes.map(mapPublicScene)
        : mapDbStoredScenesToPublic(tour.generationScenes)
      : [];
    const firstSceneEmbed =
      resolvedScenes.find(
        (x) => x.generationStatus === "completed" && x.generatedTourUrl,
      )?.generatedTourUrl ?? null;
    const firstPanorama =
      panoramaRooms[0]?.panoramaUrl ??
      mem?.scenes.find((s) => s.generatedTourUrl)?.generatedTourUrl ??
      null;

    return res.json({
      id: tour.id,
      shareToken: tour.shareToken,
      listingAddress: tour.listingAddress,
      listingPlatform: tour.listingPlatform,
      listingPrice: tour.listingPrice,
      listingBedrooms: tour.listingBedrooms,
      listingBathrooms: tour.listingBathrooms,
      listingSqft: tour.listingSqft,
      isFullHouse: tour.isFullHouse ?? false,
      panoramaStatus: tour.panoramaStatus ?? "pending",
      roomsReady: tour.roomsReady ?? 0,
      tourType: tour.tourType ?? "panorama",
      rooms: rooms.map(mapRoom),
      confidenceScore: tour.confidenceScore,
      realAngles: tour.realAngles,
      aiHighAngles: tour.aiHighAngles,
      aiLowAngles: tour.aiLowAngles,
      isWatermarked: tour.isWatermarked,
      agentName: agent?.fullName ?? null,
      agentLogo: agent?.avatarUrl ?? null,
      thumbnailUrl: tour.thumbnailUrl,
      generatedTourUrl:
        frozen
          ? null
          : mem?.generatedTourUrl ??
            tour.generatedTourUrl ??
            firstSceneEmbed ??
            firstPanorama,
      generationStatus: mem?.generationStatus ?? tour.generationStatus,
      frozen,
      expiresAt,
      createdOnTier,
      scenes: resolvedScenes,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
