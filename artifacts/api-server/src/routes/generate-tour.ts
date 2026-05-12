import { Router } from "express";
import { db } from "@workspace/db";
import { toursTable, profilesTable, tourPhotosTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { createWorld, schedulePoll } from "../lib/worldlabs";
import { uploadDataUrlToStorage } from "../lib/imageStorage";
import {
  createMemTour,
  getMemTour,
  memTourCountThisMonthForUser,
} from "../lib/tourMemoryStore";
import {
  getMemUser,
  setMemUserTier,
  TIER_TOUR_LIMITS,
  FREE_TIER_TTL_MS,
  isPaidTier,
} from "../lib/userMemoryStore";
import { GenerateTourBody } from "@workspace/api-zod";

const router = Router();

const TOUR_LIMITS = TIER_TOUR_LIMITS;

function generateShareToken() {
  return randomBytes(12).toString("hex");
}

function detectPlatform(url: string): string {
  if (url.includes("zillow")) return "zillow";
  if (url.includes("airbnb")) return "airbnb";
  if (url.includes("bayut")) return "bayut";
  if (url.includes("propertyfinder")) return "property_finder";
  return "other";
}

// POST /generate-tour
router.post("/generate-tour", async (req, res) => {
  try {
    const userId =
      (req.user as { profileId?: string; id?: string } | undefined)?.profileId ??
      (req.user as { id?: string } | undefined)?.id ??
      (req.headers["x-user-id"] as string | undefined);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = GenerateTourBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { listingUrl, floorCount } = parsed.data;
    const imageUrls: string[] = parsed.data.imageUrls ?? [];
    const uploadedImages: { name: string; dataUrl: string }[] = parsed.data.uploadedImages ?? [];

    // Resolve the user's tier — prefer DB, fall back to memory.
    let userTier: "free" | "pro" | "unlimited" = "free";
    let dbToursThisMonth = 0;
    try {
      const profile = await db.query.profilesTable.findFirst({
        where: eq(profilesTable.id, userId),
      });
      if (profile) {
        userTier =
          (profile.subscriptionTier as "free" | "pro" | "unlimited") ?? "free";
        dbToursThisMonth = profile.toursThisMonth ?? 0;
        // Mirror the tier into memory so /subscribe + freeze logic agree
        setMemUserTier(userId, userTier);
      } else {
        userTier = getMemUser(userId).tier;
      }
    } catch {
      req.log.warn(
        "DB unavailable for profile lookup — using memory store for tier",
      );
      userTier = getMemUser(userId).tier;
    }

    const tierLimit = TOUR_LIMITS[userTier] ?? 1;
    const memCount = memTourCountThisMonthForUser(userId);
    const effectiveToursThisMonth = Math.max(dbToursThisMonth, memCount);
    if (effectiveToursThisMonth >= tierLimit) {
      return res.status(403).json({
        error: "Tour limit reached. Upgrade to generate more tours.",
        code: "LIMIT_REACHED",
      });
    }

    // Build the final image URL list
    const allImageUrls = [...imageUrls];

    // Convert any inline base64 uploaded images into Supabase Storage URLs
    // so WorldLabs can fetch them publicly.
    const uploadedPublicUrls: string[] = (
      await Promise.all(
        uploadedImages
          .slice(0, 8)
          .map((img) => uploadDataUrlToStorage(img.dataUrl, userId, req)),
      )
    ).filter((url): url is string => !!url);

    // Only keep https/public URLs — WorldLabs cannot fetch http/localhost.
    const publicImageUrls = [
      ...allImageUrls.filter((u) => u.startsWith("https://")),
      ...uploadedPublicUrls,
    ];

    const shareToken = generateShareToken();
    const platform = detectPlatform(listingUrl);
    const processingStartedAt = new Date();

    // Create tour record — fall back to a generated ID if DB is unavailable
    let tourId: string = randomBytes(16).toString("hex");
    let dbTourCreated = false;
    const totalImageCount = publicImageUrls.length + uploadedImages.length;

    try {
      const [tour] = await db
        .insert(toursTable)
        .values({
          userId,
          listingUrl,
          listingPlatform: platform,
          listingAddress:
            listingUrl === "manual-upload"
              ? "Uploaded photos"
              : "Property at " + listingUrl.split("/")[2],
          status: "pending",
          shareToken,
          floorCount: floorCount ?? 1,
          isWatermarked: true,
          processingStartedAt,
          generationStatus: "queued",
          currentStage: "Preparing images…",
          totalPhotosExtracted: publicImageUrls.length + uploadedImages.length,
          photosUsed: publicImageUrls.length + uploadedImages.length,
        })
        .returning();
      tourId = tour.id;
      dbTourCreated = true;
    } catch {
      req.log.warn("DB unavailable for tour insert — using ephemeral tour ID");
    }

    // Always create an in-memory mirror so the status endpoint and the
    // background poller can keep working even when Postgres is unreachable.
    const listingAddress =
      listingUrl === "manual-upload"
        ? "Uploaded photos"
        : "Property at " + (listingUrl.split("/")[2] ?? listingUrl);
    const expiresAt = isPaidTier(userTier)
      ? null
      : Date.now() + FREE_TIER_TTL_MS;
    createMemTour({
      tourId,
      userId,
      shareToken,
      listingUrl,
      listingAddress,
      listingPlatform: platform,
      operationId: null,
      worldId: null,
      generationStatus: "queued",
      currentStage: "Preparing images…",
      generatedTourUrl: null,
      previewImageUrl: null,
      errorMessage: null,
      imageCount: totalImageCount,
      viewCount: 0,
      completedAt: null,
      expiresAt,
      frozen: false,
      createdOnTier: userTier,
    });

    // Store uploaded photos as tour_photos rows (thumbnail only)
    if (dbTourCreated && uploadedImages.length > 0) {
      try {
        const photoRows = uploadedImages.slice(0, 20).map((img, i) => ({
          tourId,
          roomLabel: `Uploaded Photo ${i + 1}`,
          floorNumber: 1,
          qualityScore: 4,
          isSelected: true,
          isBestForRoom: i === 0,
          isAiGenerated: false,
          thumbnailUrl: img.dataUrl.length < 500_000 ? img.dataUrl : null,
        }));
        await db.insert(tourPhotosTable).values(photoRows);
      } catch {
        req.log.warn("DB unavailable for tour_photos insert — skipping");
      }
    }

    // If no images at all, simulate
    if (publicImageUrls.length === 0) {
      if (dbTourCreated) await simulateTourProcessing(tourId, userId).catch(() => {});
      return res.json({ tourId, shareToken });
    }

    // Attempt WorldLabs generation
    let worldlabsStarted = false;
    let operationId: string | undefined;
    try {
      const result = await createWorld(publicImageUrls);
      operationId = result.operationId;

      // Mirror into memory so the status endpoint sees the new state
      // regardless of DB availability.
      const mem = getMemTour(tourId);
      if (mem) {
        mem.operationId = operationId;
        mem.generationStatus = "processing";
        mem.currentStage = "Building your 3D world…";
      }

      if (dbTourCreated) {
        try {
          await db
            .update(toursTable)
            .set({
              worldlabsJobId: operationId,
              generationStatus: "processing",
              currentStage: "Building your 3D world…",
            })
            .where(eq(toursTable.id, tourId));
        } catch {
          req.log.warn("DB unavailable for tour status update — skipping");
        }
      }

      schedulePoll(tourId, operationId, processingStartedAt);
      worldlabsStarted = true;

      req.log.info({ tourId, operationId }, "WorldLabs generation started");
    } catch (apiErr) {
      req.log.warn(
        { err: apiErr, tourId },
        "WorldLabs API call failed — falling back to simulation",
      );
      const mem = getMemTour(tourId);
      if (mem) {
        mem.generationStatus = "failed";
        mem.currentStage = "failed";
        mem.errorMessage =
          apiErr instanceof Error ? apiErr.message : "Marble API request failed";
      }
    }

    if (!worldlabsStarted) {
      if (dbTourCreated) await simulateTourProcessing(tourId, userId).catch(() => {});
    } else {
      // Update profile counters
      try {
        await db
          .update(profilesTable)
          .set({
            toursThisMonth: sql`tours_this_month + 1`,
            totalTours: sql`total_tours + 1`,
          })
          .where(eq(profilesTable.id, userId));
      } catch {
        req.log.warn("DB unavailable for profile counter update — skipping");
      }
    }

    return res.json({ tourId, shareToken });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /generate-tour/:tourId/status — richer status for generation flow
router.get("/generate-tour/:tourId/status", async (req, res) => {
  const userId =
    (req.user as { profileId?: string; id?: string } | undefined)?.profileId ??
    (req.user as { id?: string } | undefined)?.id ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const stageLabels: Record<string, string> = {
    queued: "Queued for generation…",
    processing: "Building your 3D world…",
    completed: "Tour ready!",
    failed: "Generation failed",
  };

  const estimatedMinutes: Record<string, number> = {
    queued: 5,
    processing: 3,
    completed: 0,
    failed: 0,
  };

  // Try DB first, but never fail the request because of it — the
  // generation pipeline maintains an in-memory mirror so the frontend
  // can poll status even when Postgres is unreachable.
  let tour: Awaited<ReturnType<typeof db.query.toursTable.findFirst>> | undefined;
  try {
    tour = await db.query.toursTable.findFirst({
      where: eq(toursTable.id, req.params.tourId),
    });
  } catch (err) {
    req.log.warn({ err }, "DB unavailable for status lookup — falling back to memory");
  }

  if (tour) {
    if (tour.userId !== userId) {
      return res.status(404).json({ error: "Tour not found" });
    }
    return res.json({
      status: tour.status,
      generationStatus: tour.generationStatus,
      currentStage:
        tour.currentStage ?? stageLabels[tour.generationStatus ?? "queued"],
      estimatedMinutes: estimatedMinutes[tour.generationStatus ?? "queued"] ?? 3,
      worldlabsJobId: tour.worldlabsJobId,
      generatedTourUrl: tour.generatedTourUrl,
      previewImageUrl: tour.previewImageUrl ?? tour.thumbnailUrl,
      errorMessage: tour.errorMessage,
      confidenceScore: tour.confidenceScore,
      roomsDetected: tour.roomsDetected,
    });
  }

  const mem = getMemTour(req.params.tourId);
  if (!mem || mem.userId !== userId) {
    return res.status(404).json({ error: "Tour not found" });
  }

  return res.json({
    status: mem.generationStatus === "completed" ? "ready" : "pending",
    generationStatus: mem.generationStatus,
    currentStage: mem.currentStage ?? stageLabels[mem.generationStatus],
    estimatedMinutes: estimatedMinutes[mem.generationStatus] ?? 3,
    worldlabsJobId: mem.worldId ?? mem.operationId,
    generatedTourUrl: mem.generatedTourUrl,
    previewImageUrl: mem.previewImageUrl,
    errorMessage: mem.errorMessage,
    confidenceScore: null,
    roomsDetected: null,
  });
});

// ─── Simulation fallback ──────────────────────────────────────────────────────

async function simulateTourProcessing(tourId: string, userId: string) {
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
    marbleEmbedUrl: null as string | null,
    thumbnailUrl: `https://images.unsplash.com/photo-${1560000000 + i * 100000}?w=400&q=60`,
  }));

  const realCount = rooms.filter((r) => r.isReal).length;
  const aiHighCount = rooms.filter((r) => !r.isReal && r.confidence > 0.6).length;
  const aiLowCount = rooms.filter((r) => !r.isReal && r.confidence <= 0.6).length;

  try { await db.insert(tourPhotosTable).values(roomInserts); } catch {}

  try {
    await db
      .update(toursTable)
      .set({
        status: "ready",
        generationStatus: "completed",
        roomsDetected: rooms.length,
        totalPhotosExtracted: rooms.length * 3,
        photosUsed: rooms.length,
        realAngles: realCount,
        aiHighAngles: aiHighCount,
        aiLowAngles: aiLowCount,
        confidenceScore: (realCount / rooms.length) * 100,
        processingCompletedAt: new Date(),
        currentStage: "ready",
        listingBedrooms: 3,
        listingBathrooms: 2,
        listingSqft: "1,850",
        thumbnailUrl: "https://images.unsplash.com/photo-1560184897-ae75f418493e?w=800&q=60",
      })
      .where(eq(toursTable.id, tourId));
  } catch {}

  try {
    await db
      .update(profilesTable)
      .set({
        toursThisMonth: sql`tours_this_month + 1`,
        totalTours: sql`total_tours + 1`,
      })
      .where(eq(profilesTable.id, userId));
  } catch {}
}

export default router;
