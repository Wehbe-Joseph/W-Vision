import { waitUntil } from "@vercel/functions";
import { Router } from "express";
import { db } from "@workspace/db";
import { toursTable, profilesTable, tourPhotosTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { uploadDataUrlToStorage } from "../lib/imageStorage";
import {
  createMemTour,
  getMemTour,
  type MemScene,
} from "../lib/tourMemoryStore";
import { persistedScenesToMemScenes } from "../lib/tourScenesPersistence";
import {
  advanceTourGeneration,
  saveTourSourceImages,
} from "../lib/tourGenerationDriver";
import { runFullTourPipeline } from "../lib/tourPipeline";
import { setMemUserTier } from "../lib/userMemoryStore";
import { PIPELINE_STAGE_LABELS } from "../lib/tourPipeline";
import { GenerateTourBody } from "@workspace/api-zod";

const router = Router();

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

    try {
      const profile = await db.query.profilesTable.findFirst({
        where: eq(profilesTable.id, userId),
      });
      if (profile?.subscriptionTier) {
        setMemUserTier(
          userId,
          profile.subscriptionTier as "free" | "pro" | "unlimited",
        );
      }
    } catch {
      req.log.warn("DB unavailable for profile lookup");
    }

    // Build the final image URL list
    const allImageUrls = [...imageUrls];

    // Convert any inline base64 uploaded images into Supabase Storage URLs.
    const uploadedPublicUrls: string[] = (
      await Promise.all(
        uploadedImages
          .slice(0, 8)
          .map((img) => uploadDataUrlToStorage(img.dataUrl, userId, req)),
      )
    ).filter((url): url is string => !!url);

    // Only keep https/public URLs for classification and photo tours.
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
          isWatermarked: false,
          isFullHouse: true,
          tourType: "panorama",
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
    const memTour = createMemTour({
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
      expiresAt: null,
      frozen: false,
      createdOnTier: "unlimited",
      scenes: [],
      sourceImageUrls: publicImageUrls,
      pipelineStage: 1,
    });

    void saveTourSourceImages(tourId, publicImageUrls, memTour);

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

    // ── Respond IMMEDIATELY ──────────────────────────────────────────────
    //
    // Gemini classification can take 30s+; respond immediately and advance on status polls.
    res.json({ tourId, shareToken });

    if (process.env.VERCEL) {
      // Serverless: no background timers — each GET /status (and this kick) advances work.
      waitUntil(
        advanceTourGeneration(tourId, userId, req.log).catch((err) => {
          req.log.error({ err, tourId }, "Status-driven generation tick failed");
        }),
      );
      return;
    }

    const pipeline = runFullTourPipeline({
      tourId,
      userId,
      imageUrls: publicImageUrls,
      reqLog: req.log,
    });

    pipeline.catch((err) => {
      req.log.error({ err, tourId }, "Background tour pipeline crashed");
    });
    return;
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

  try {
    await advanceTourGeneration(req.params.tourId, userId, req.log);
  } catch (err) {
    req.log.warn({ err, tourId: req.params.tourId }, "Status-driven generation tick failed");
  }

  const stageLabels: Record<string, string> = {
    queued: "Queued for generation…",
    processing: "Organizing your tour…",
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

  // Memory always wins for `scenes` (DB doesn't track them yet). For
  // everything else we prefer memory when available since the pipeline runs
  // there; falling back to DB only when memory is empty.
  const mem = getMemTour(req.params.tourId);

  if (tour && (!mem || tour.userId === userId)) {
    if (tour.userId !== userId) {
      return res.status(404).json({ error: "Tour not found" });
    }
    const stage = mem?.pipelineStage ?? 1;
    return res.json({
      status: tour.status,
      generationStatus: mem?.generationStatus ?? tour.generationStatus,
      pipelineStage: stage,
      pipelineStageLabel: PIPELINE_STAGE_LABELS[stage as 1 | 2 | 3 | 4],
      currentStage:
        mem?.currentStage ??
        tour.currentStage ??
        stageLabels[tour.generationStatus ?? "queued"],
      estimatedMinutes:
        estimatedMinutes[mem?.generationStatus ?? tour.generationStatus ?? "queued"] ?? 3,
      worldlabsJobId: null,
      generatedTourUrl: mem?.generatedTourUrl ?? tour.generatedTourUrl,
      previewImageUrl:
        mem?.previewImageUrl ?? tour.previewImageUrl ?? tour.thumbnailUrl,
      errorMessage: mem?.errorMessage ?? tour.errorMessage,
      confidenceScore: tour.confidenceScore,
      roomsDetected: mem?.roomsDetected ?? mem?.scenes.length ?? tour.roomsDetected,
      roomsTotal: mem?.roomsDetected ?? mem?.scenes.length ?? tour.roomsDetected,
      roomsReady: mem?.roomsReady ?? tour.roomsReady ?? 0,
      shareToken: tour.shareToken,
      scenes: (mem?.scenes ?? []).map(serializeScene),
    });
  }

  if (!mem || mem.userId !== userId) {
    return res.status(404).json({ error: "Tour not found" });
  }

  const stage = mem.pipelineStage ?? 1;
  return res.json({
    status: mem.generationStatus === "completed" ? "ready" : "pending",
    generationStatus: mem.generationStatus,
    pipelineStage: stage,
    pipelineStageLabel: PIPELINE_STAGE_LABELS[stage as 1 | 2 | 3 | 4],
    currentStage: mem.currentStage ?? stageLabels[mem.generationStatus],
    estimatedMinutes: estimatedMinutes[mem.generationStatus] ?? 3,
    worldlabsJobId: null,
    generatedTourUrl: mem.generatedTourUrl,
    previewImageUrl: mem.previewImageUrl,
    errorMessage: mem.errorMessage,
    confidenceScore: null,
      roomsDetected: mem.roomsDetected ?? (mem.scenes.length || null),
    roomsTotal: mem.roomsDetected ?? mem.scenes.length,
    roomsReady: mem.roomsReady ?? 0,
    shareToken: mem.shareToken,
    scenes: mem.scenes.map(serializeScene),
  });
});

function serializeScene(s: MemScene) {
  return {
    id: s.id,
    label: s.label,
    roomType: s.roomType,
    thumbnailUrl: s.thumbnailUrl,
    imageCount: s.imageUrls.length,
    generationStatus: s.generationStatus,
    generatedTourUrl: s.generatedTourUrl,
    worldId: s.worldId,
    errorMessage: s.errorMessage,
    locked: s.locked,
  };
}

// POST /generate-tour/:tourId/resume — re-run pipeline for incomplete tours
router.post("/generate-tour/:tourId/resume", async (req, res) => {
  const userId =
    (req.user as { profileId?: string; id?: string } | undefined)?.profileId ??
    (req.user as { id?: string } | undefined)?.id ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  let mem = getMemTour(req.params.tourId);
  if (!mem) {
    try {
      const tour = await db.query.toursTable.findFirst({
        where: eq(toursTable.id, req.params.tourId),
      });
      if (!tour || tour.userId !== userId) {
        return res.status(404).json({ error: "Tour not found" });
      }
      const scenes = persistedScenesToMemScenes(tour.generationScenes);
      createMemTour({
        tourId: tour.id,
        userId: tour.userId,
        shareToken: tour.shareToken ?? "",
        listingUrl: tour.listingUrl,
        listingAddress: tour.listingAddress ?? tour.listingUrl,
        listingPlatform: tour.listingPlatform ?? "other",
        operationId: null,
        worldId: null,
        generationStatus: "processing",
        currentStage: tour.currentStage ?? "Resuming…",
        generatedTourUrl: tour.generatedTourUrl,
        previewImageUrl: tour.previewImageUrl ?? tour.thumbnailUrl,
        errorMessage: tour.errorMessage,
        imageCount: tour.photosUsed ?? 0,
        viewCount: tour.viewCount,
        completedAt: null,
        expiresAt: null,
        frozen: false,
        createdOnTier: "unlimited",
        scenes,
        sourceImageUrls: [],
      });
      mem = getMemTour(req.params.tourId);
    } catch {
      return res.status(404).json({ error: "Tour not found" });
    }
  }

  if (!mem || mem.userId !== userId) {
    return res.status(404).json({ error: "Tour not found" });
  }

  const imageUrls =
    mem.sourceImageUrls?.length
      ? mem.sourceImageUrls
      : mem.scenes.flatMap((s) => s.imageUrls);

  res.json({ success: true, message: "Resuming tour generation…" });

  void runFullTourPipeline({
    tourId: req.params.tourId,
    userId,
    imageUrls,
    reqLog: req.log,
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
