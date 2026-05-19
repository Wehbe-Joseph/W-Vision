import { waitUntil } from "@vercel/functions";
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
  memTotalToursForUser,
  updateMemScene,
  rollupMemTourFromScenes,
  type MemScene,
  type MemGenerationStatus,
} from "../lib/tourMemoryStore";
import {
  classifyListingImages,
  groupClassificationsIntoScenes,
} from "../services/imageClassifier";
import { queuePersistTourScenes, persistedScenesToMemScenes } from "../lib/tourScenesPersistence";
import {
  getMemUser,
  setMemUserTier,
  TIER_TOUR_LIMITS,
  FREE_TIER_TTL_MS,
  isPaidTier,
  type SubscriptionTier,
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
    let dbTotalTours = 0;
    try {
      const profile = await db.query.profilesTable.findFirst({
        where: eq(profilesTable.id, userId),
      });
      if (profile) {
        userTier =
          (profile.subscriptionTier as "free" | "pro" | "unlimited") ?? "free";
        dbToursThisMonth = profile.toursThisMonth ?? 0;
        dbTotalTours = profile.totalTours ?? 0;
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
    const memCountThisMonth = memTourCountThisMonthForUser(userId);
    const memTotalTours = memTotalToursForUser(userId);
    const effectiveUsageCount =
      userTier === "free"
        ? Math.max(memTotalTours, dbTotalTours)
        : Math.max(dbToursThisMonth, memCountThisMonth);
    if (effectiveUsageCount >= tierLimit) {
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
      scenes: [],
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

    // ── Respond IMMEDIATELY ──────────────────────────────────────────────
    //
    // Gemini classification + Marble dispatch can take 30s+; we don't want
    // the frontend's POST to hang that long. Kick off the pipeline in the
    // background — the status endpoint surfaces progress to the client.
    res.json({ tourId, shareToken });

    const pipeline = runGenerationPipeline({
      tourId,
      userId,
      dbTourCreated,
      imageUrls: publicImageUrls,
      processingStartedAt,
      userTier,
      reqLog: req.log,
    });

    if (process.env.VERCEL) {
      waitUntil(
        pipeline.catch((err) => {
          req.log.error({ err, tourId }, "Background tour pipeline crashed");
        }),
      );
    } else {
      pipeline.catch((err) => {
        req.log.error({ err, tourId }, "Background tour pipeline crashed");
      });
    }
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

  // Memory always wins for `scenes` (DB doesn't track them yet). For
  // everything else we prefer memory when available since the pipeline runs
  // there; falling back to DB only when memory is empty.
  const mem = getMemTour(req.params.tourId);

  if (tour && (!mem || tour.userId === userId)) {
    if (tour.userId !== userId) {
      return res.status(404).json({ error: "Tour not found" });
    }
    return res.json({
      status: tour.status,
      generationStatus: mem?.generationStatus ?? tour.generationStatus,
      currentStage:
        mem?.currentStage ??
        tour.currentStage ??
        stageLabels[tour.generationStatus ?? "queued"],
      estimatedMinutes:
        estimatedMinutes[mem?.generationStatus ?? tour.generationStatus ?? "queued"] ?? 3,
      worldlabsJobId: tour.worldlabsJobId,
      generatedTourUrl: mem?.generatedTourUrl ?? tour.generatedTourUrl,
      previewImageUrl:
        mem?.previewImageUrl ?? tour.previewImageUrl ?? tour.thumbnailUrl,
      errorMessage: mem?.errorMessage ?? tour.errorMessage,
      confidenceScore: tour.confidenceScore,
      roomsDetected: mem?.scenes.length ?? tour.roomsDetected,
      scenes: (mem?.scenes ?? []).map(serializeScene),
    });
  }

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
    roomsDetected: mem.scenes.length || null,
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

// POST /generate-tour/:tourId/resume — after upgrade, unlock + dispatch
// every scene that was deferred by the free-tier limiter.
router.post("/generate-tour/:tourId/resume", async (req, res) => {
  const userId =
    (req.user as { profileId?: string; id?: string } | undefined)?.profileId ??
    (req.user as { id?: string } | undefined)?.id ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  // Resolve tier from DB / memory (upgrade must have landed before resume).
  let tier: "free" | "pro" | "unlimited" = getMemUser(userId).tier;
  try {
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, userId),
    });
    if (profile?.subscriptionTier) {
      tier = profile.subscriptionTier as typeof tier;
      setMemUserTier(userId, tier);
    }
  } catch {
    /* memory tier is fine */
  }

  if (!isPaidTier(tier)) {
    return res.status(402).json({
      error: "Upgrade required",
      code: "PAYMENT_REQUIRED",
      message:
        "Upgrade to a paid plan to build the rest of your home in 3D.",
    });
  }

  let mem = getMemTour(req.params.tourId);

  // After an api-server restart the in-memory mirror is empty — rebuild it
  // from Postgres `generation_scenes` so resume still works.
  if (!mem) {
    try {
      const tour = await db.query.toursTable.findFirst({
        where: eq(toursTable.id, req.params.tourId),
      });
      if (!tour || tour.userId !== userId) {
        return res.status(404).json({ error: "Tour not found" });
      }
      const scenes = persistedScenesToMemScenes(tour.generationScenes);
      if (scenes.length === 0) {
        return res.status(404).json({
          error: "Tour not found",
          message:
            "No saved room data for this tour. Open the share link once, or generate the tour again.",
        });
      }
      const gs = tour.generationStatus;
      const generationStatus: MemGenerationStatus =
        gs === "queued" || gs === "processing" || gs === "completed" || gs === "failed"
          ? gs
          : "processing";

      createMemTour({
        tourId: tour.id,
        userId: tour.userId,
        shareToken: tour.shareToken ?? "",
        listingUrl: tour.listingUrl,
        listingAddress: tour.listingAddress ?? tour.listingUrl,
        listingPlatform: tour.listingPlatform ?? "other",
        operationId: null,
        worldId: null,
        generationStatus,
        currentStage: tour.currentStage ?? "Restored from database…",
        generatedTourUrl: tour.generatedTourUrl,
        previewImageUrl: tour.previewImageUrl ?? tour.thumbnailUrl,
        errorMessage: tour.errorMessage,
        imageCount: tour.photosUsed ?? 0,
        viewCount: tour.viewCount,
        completedAt: tour.processingCompletedAt?.getTime() ?? null,
        expiresAt: null,
        frozen: false,
        createdOnTier: tier,
        scenes,
      });
      rollupMemTourFromScenes(tour.id);
      mem = getMemTour(req.params.tourId);
    } catch (err) {
      req.log.warn({ err, tourId: req.params.tourId }, "DB hydrate for resume failed");
      return res.status(404).json({ error: "Tour not found" });
    }
  }

  if (!mem || mem.userId !== userId) {
    return res.status(404).json({ error: "Tour not found" });
  }

  const lockedScenes = mem.scenes.filter((s) => s.locked);
  if (lockedScenes.length === 0) {
    return res.json({ success: true, resumed: 0, message: "Nothing to resume." });
  }

  // Flip the flag immediately so the UI can show "queued for generation"
  // for the locked rooms while Marble works through them.
  for (const scene of lockedScenes) {
    updateMemScene(req.params.tourId, scene.id, {
      locked: false,
      generationStatus: "queued",
      errorMessage: null,
    });
  }
  mem.createdOnTier = tier;
  mem.expiresAt = null;
  mem.frozen = false;
  mem.generationStatus = "processing";
  mem.currentStage = `Resuming generation for ${lockedScenes.length} room${
    lockedScenes.length === 1 ? "" : "s"
  }…`;
  rollupMemTourFromScenes(req.params.tourId);
  queuePersistTourScenes(req.params.tourId);

  // Respond fast — Marble dispatch happens in the background, the status
  // endpoint surfaces progress as usual.
  res.json({
    success: true,
    resumed: lockedScenes.length,
    message: `Building ${lockedScenes.length} more room${
      lockedScenes.length === 1 ? "" : "s"
    } in 3D…`,
  });

  void resumeLockedScenes({
    tourId: req.params.tourId,
    sceneIds: lockedScenes.map((s) => s.id),
    processingStartedAt: new Date(),
    reqLog: req.log,
  });
  return;
});

async function resumeLockedScenes(opts: {
  tourId: string;
  sceneIds: string[];
  processingStartedAt: Date;
  reqLog: { info: Function; warn: Function; error: Function };
}): Promise<void> {
  const { tourId, sceneIds, processingStartedAt, reqLog } = opts;
  const RATE_LIMIT_GAP_MS = 1500;

  for (const sceneId of sceneIds) {
    const mem = getMemTour(tourId);
    const scene = mem?.scenes.find((s) => s.id === sceneId);
    if (!scene) continue;

    let attempt = 0;
    let lastErr: unknown = null;
    while (attempt < 4) {
      try {
        const result = await createWorld(scene.imageUrls);
        updateMemScene(tourId, scene.id, {
          operationId: result.operationId,
          generationStatus: "processing",
        });
        schedulePoll(
          `${tourId}::${scene.id}`,
          result.operationId,
          processingStartedAt,
        );
        reqLog.info(
          { tourId, sceneId: scene.id, operationId: result.operationId },
          "WorldLabs generation started (resumed)",
        );
        lastErr = null;
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        lastErr = err;
        if (/\b429\b|rate limit/i.test(message)) {
          const wait = 2000 * Math.pow(2, attempt);
          reqLog.warn(
            { tourId, sceneId: scene.id, attempt, wait },
            "Marble rate-limited on resume — backing off",
          );
          await new Promise((r) => setTimeout(r, wait));
          attempt += 1;
          continue;
        }
        break;
      }
    }
    if (lastErr) {
      const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
      reqLog.warn(
        { err: lastErr, tourId, sceneId: scene.id },
        "Marble dispatch failed on resume",
      );
      updateMemScene(tourId, scene.id, {
        generationStatus: "failed",
        errorMessage: message,
      });
    }
    await new Promise((r) => setTimeout(r, RATE_LIMIT_GAP_MS));
  }
  rollupMemTourFromScenes(tourId);
  queuePersistTourScenes(tourId);
}

// ─── Background pipeline ──────────────────────────────────────────────────────

interface PipelineCtx {
  tourId: string;
  userId: string;
  dbTourCreated: boolean;
  imageUrls: string[];
  processingStartedAt: Date;
  userTier: SubscriptionTier;
  reqLog: { info: Function; warn: Function; error: Function };
}

/**
 * Full generation pipeline: Gemini classification → group by room → one
 * Marble world per room. Each scene polls independently; the parent tour
 * status is rolled up from its scenes.
 */
async function runGenerationPipeline(ctx: PipelineCtx): Promise<void> {
  const { tourId, userId, dbTourCreated, imageUrls, processingStartedAt, userTier, reqLog } =
    ctx;

  // 1. Classify every image with Gemini (batches of 5, never throws).
  const memBefore = getMemTour(tourId);
  if (memBefore) {
    memBefore.currentStage = "Analyzing photos with AI…";
    memBefore.generationStatus = "processing";
  }
  reqLog.info({ tourId, imageCount: imageUrls.length }, "Classifying images");

  const classifications = await classifyListingImages(imageUrls, {
    onBatch: (idx) => {
      const m = getMemTour(tourId);
      if (m) {
        m.currentStage = `Analyzing photos with AI… (batch ${idx + 1})`;
      }
    },
  });

  // 2. Group into scenes (one per detected room type).
  const groups = groupClassificationsIntoScenes(classifications);
  if (groups.length === 0) {
    const m = getMemTour(tourId);
    if (m) {
      m.generationStatus = "failed";
      m.errorMessage = "Couldn't classify any photos for 3D generation";
    }
    return;
  }

  // Free tier: classify everything, but only generate ONE world.
  // The other scenes are stored as `locked` and resumed after upgrade.
  const isFree = !isPaidTier(userTier);
  const scenes: MemScene[] = groups.map((g, idx) => ({
    id: g.id,
    label: g.label,
    roomType: g.roomType,
    thumbnailUrl: g.thumbnailUrl,
    imageUrls: g.imageUrls,
    operationId: null,
    worldId: null,
    generationStatus: "queued",
    generatedTourUrl: null,
    errorMessage: null,
    locked: isFree && idx > 0,
  }));

  const dispatchableCount = scenes.filter((s) => !s.locked).length;
  const lockedCount = scenes.length - dispatchableCount;

  const memAfter = getMemTour(tourId);
  if (memAfter) {
    memAfter.scenes = scenes;
    memAfter.currentStage =
      lockedCount > 0
        ? `Building 1 of ${scenes.length} rooms (free tier) — upgrade to unlock the rest…`
        : `Building ${scenes.length} 3D environment${
            scenes.length === 1 ? "" : "s"
          }…`;
    memAfter.previewImageUrl = scenes[0]?.thumbnailUrl ?? null;
    memAfter.generationStatus = "processing";
  }

  queuePersistTourScenes(tourId);

  reqLog.info(
    {
      tourId,
      sceneCount: scenes.length,
      lockedCount,
      tier: userTier,
      rooms: scenes.map((s) => `${s.label}${s.locked ? " [locked]" : ""}`),
    },
    "Created scenes",
  );

  // Dispatch sequentially with backoff so we don't trip Marble's per-second
  // rate limit (~1 RPS on the standard tier). Each scene goes one-at-a-time
  // and retries up to 3 times on 429. Locked scenes (free tier) are skipped.
  const RATE_LIMIT_GAP_MS = 1500;
  for (const scene of scenes) {
    if (scene.locked) {
      reqLog.info(
        { tourId, sceneId: scene.id, label: scene.label },
        "Scene locked behind upgrade — skipping Marble dispatch",
      );
      continue;
    }
    let attempt = 0;
    let lastErr: unknown = null;
    while (attempt < 4) {
      try {
        const result = await createWorld(scene.imageUrls);
        updateMemScene(tourId, scene.id, {
          operationId: result.operationId,
          generationStatus: "processing",
        });
        schedulePoll(
          `${tourId}::${scene.id}`,
          result.operationId,
          processingStartedAt,
        );
        reqLog.info(
          { tourId, sceneId: scene.id, operationId: result.operationId },
          "WorldLabs generation started",
        );
        lastErr = null;
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        lastErr = err;
        if (/\b429\b|rate limit/i.test(message)) {
          const wait = 2000 * Math.pow(2, attempt);
          reqLog.warn(
            { tourId, sceneId: scene.id, attempt, wait },
            "Marble rate-limited — backing off",
          );
          await new Promise((r) => setTimeout(r, wait));
          attempt += 1;
          continue;
        }
        // Non-rate-limit error → give up on this scene.
        break;
      }
    }
    if (lastErr) {
      const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
      reqLog.warn(
        { err: lastErr, tourId, sceneId: scene.id },
        "Marble dispatch failed after retries",
      );
      updateMemScene(tourId, scene.id, {
        generationStatus: "failed",
        errorMessage: message,
      });
    }
    // Brief pause between scenes to stay well under the rate limit.
    await new Promise((r) => setTimeout(r, RATE_LIMIT_GAP_MS));
  }
  rollupMemTourFromScenes(tourId);
  queuePersistTourScenes(tourId);

  // 4. Bump usage counters (best-effort).
  if (dbTourCreated) {
    try {
      await db
        .update(profilesTable)
        .set({
          toursThisMonth: sql`tours_this_month + 1`,
          totalTours: sql`total_tours + 1`,
        })
        .where(eq(profilesTable.id, userId));
    } catch {
      reqLog.warn("DB unavailable for profile counter update — skipping");
    }
  }
}

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
