import { db } from "@workspace/db";
import { toursTable, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createWorld, pollOperationNow } from "./worldlabs";
import {
  classifyListingImages,
  groupClassificationsIntoScenes,
} from "../services/imageClassifier";
import {
  createMemTour,
  getMemTour,
  updateMemScene,
  rollupMemTourFromScenes,
  type MemScene,
  type MemGenerationStatus,
  type MemTour,
} from "./tourMemoryStore";
import {
  persistedScenesToMemScenes,
  queuePersistTourScenes,
} from "./tourScenesPersistence";
import { isPaidTier, getMemUser, type SubscriptionTier } from "./userMemoryStore";
import { logger } from "./logger";

type ReqLog = { info: Function; warn: Function; error: Function };

function readSourceImageUrls(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const urls = (raw as { _sourceImageUrls?: unknown })._sourceImageUrls;
  if (!Array.isArray(urls)) return [];
  return urls.filter((u): u is string => typeof u === "string" && u.startsWith("https://"));
}

async function loadTourRow(tourId: string) {
  return db.query.toursTable.findFirst({
    where: eq(toursTable.id, tourId),
  });
}

export async function hydrateMemTourFromDb(
  tourId: string,
  userId: string,
): Promise<MemTour | undefined> {
  const existing = getMemTour(tourId);
  if (existing && existing.userId === userId) return existing;

  let tour;
  try {
    tour = await loadTourRow(tourId);
  } catch (err) {
    logger.warn({ err, tourId }, "DB unavailable for tour hydrate");
    return existing;
  }
  if (!tour || tour.userId !== userId) return undefined;

  const scenes = persistedScenesToMemScenes(tour.generationScenes);
  const sourceImageUrls = readSourceImageUrls(tour.marbleWorldIds);
  const gs = tour.generationStatus;
  const generationStatus: MemGenerationStatus =
    gs === "queued" || gs === "processing" || gs === "completed" || gs === "failed"
      ? gs
      : "processing";

  let tier: SubscriptionTier = getMemUser(userId).tier;
  try {
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, userId),
    });
    if (profile?.subscriptionTier) {
      tier = profile.subscriptionTier as SubscriptionTier;
    }
  } catch {
    /* memory tier */
  }

  const mem: MemTour = createMemTour({
    tourId: tour.id,
    userId: tour.userId,
    shareToken: tour.shareToken ?? "",
    listingUrl: tour.listingUrl,
    listingAddress: tour.listingAddress ?? tour.listingUrl,
    listingPlatform: tour.listingPlatform ?? "other",
    operationId: tour.worldlabsJobId,
    worldId: tour.worldlabsJobId,
    generationStatus,
    currentStage: tour.currentStage ?? "Restored from database…",
    generatedTourUrl: tour.generatedTourUrl,
    previewImageUrl: tour.previewImageUrl ?? tour.thumbnailUrl,
    errorMessage: tour.errorMessage,
    imageCount: tour.photosUsed ?? sourceImageUrls.length,
    viewCount: tour.viewCount,
    completedAt: tour.processingCompletedAt?.getTime() ?? null,
    expiresAt: null,
    frozen: false,
    createdOnTier: tier,
    scenes,
    sourceImageUrls,
  });
  return mem;
}

async function persistSourceImageUrls(
  tourId: string,
  imageUrls: string[],
): Promise<void> {
  if (imageUrls.length === 0) return;
  try {
    await db
      .update(toursTable)
      .set({
        marbleWorldIds: { _sourceImageUrls: imageUrls },
      })
      .where(eq(toursTable.id, tourId));
  } catch (err) {
    logger.warn({ err, tourId }, "Could not persist source image URLs");
  }
}

async function buildScenesFromImages(
  tourId: string,
  imageUrls: string[],
  userTier: SubscriptionTier,
  reqLog: ReqLog,
): Promise<boolean> {
  const mem = getMemTour(tourId);
  if (!mem || mem.scenes.length > 0) return false;

  mem.currentStage = "Analyzing photos with AI…";
  mem.generationStatus = "processing";
  reqLog.info({ tourId, imageCount: imageUrls.length }, "Classifying images (status-driven)");

  const classifications = await classifyListingImages(imageUrls, {
    onBatch: (idx) => {
      const m = getMemTour(tourId);
      if (m) m.currentStage = `Analyzing photos with AI… (batch ${idx + 1})`;
    },
  });

  const groups = groupClassificationsIntoScenes(classifications);
  if (groups.length === 0) {
    mem.generationStatus = "failed";
    mem.errorMessage = "Couldn't classify any photos for 3D generation";
    queuePersistTourScenes(tourId);
    return false;
  }

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

  mem.scenes = scenes;
  mem.currentStage =
    scenes.some((s) => s.locked)
      ? `Building 1 of ${scenes.length} rooms (free tier)…`
      : `Building ${scenes.length} 3D environment${scenes.length === 1 ? "" : "s"}…`;
  mem.previewImageUrl = scenes[0]?.thumbnailUrl ?? null;
  mem.generationStatus = "processing";
  queuePersistTourScenes(tourId);
  return true;
}

async function dispatchNextScene(
  tourId: string,
  processingStartedAt: Date,
  reqLog: ReqLog,
): Promise<void> {
  const mem = getMemTour(tourId);
  if (!mem) return;

  const pending = mem.scenes.find(
    (s) => !s.locked && !s.operationId && s.generationStatus === "queued",
  );
  if (!pending) return;

  try {
    const result = await createWorld(pending.imageUrls);
    updateMemScene(tourId, pending.id, {
      operationId: result.operationId,
      generationStatus: "processing",
    });
    rollupMemTourFromScenes(tourId);
    queuePersistTourScenes(tourId);
    reqLog.info(
      { tourId, sceneId: pending.id, operationId: result.operationId },
      "WorldLabs generation started (status-driven)",
    );

    await pollOperationNow(
      `${tourId}::${pending.id}`,
      result.operationId,
      processingStartedAt,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reqLog.warn({ err, tourId, sceneId: pending.id }, "Marble dispatch failed");
    updateMemScene(tourId, pending.id, {
      generationStatus: "failed",
      errorMessage: message,
    });
    rollupMemTourFromScenes(tourId);
    queuePersistTourScenes(tourId);
  }
}

/**
 * Advance tour generation on each status poll — required on Vercel serverless
 * where background timers and in-memory state do not survive between requests.
 */
export async function advanceTourGeneration(
  tourId: string,
  userId: string,
  reqLog: ReqLog,
): Promise<void> {
  const mem = (await hydrateMemTourFromDb(tourId, userId)) ?? getMemTour(tourId);
  if (!mem || mem.userId !== userId) return;
  if (mem.generationStatus === "completed" || mem.generationStatus === "failed") {
    return;
  }

  let startedAt = new Date(mem.createdAt);
  try {
    const tour = await loadTourRow(tourId);
    if (tour?.processingStartedAt) startedAt = tour.processingStartedAt;
  } catch {
    /* use mem.createdAt */
  }

  const imageUrls =
    mem.sourceImageUrls?.length
      ? mem.sourceImageUrls
      : mem.scenes.flatMap((s) => s.imageUrls);

  if (mem.scenes.length === 0 && imageUrls.length > 0) {
    await buildScenesFromImages(tourId, imageUrls, mem.createdOnTier, reqLog);
  }

  const refreshed = getMemTour(tourId);
  if (!refreshed || refreshed.scenes.length === 0) return;

  // Poll every in-flight Marble operation once per status request.
  for (const scene of refreshed.scenes) {
    if (!scene.operationId) continue;
    if (scene.generationStatus === "completed" || scene.generationStatus === "failed") {
      continue;
    }
    await pollOperationNow(
      `${tourId}::${scene.id}`,
      scene.operationId,
      startedAt,
    );
  }

  const afterPoll = getMemTour(tourId);
  if (!afterPoll || afterPoll.generationStatus === "completed") return;

  await dispatchNextScene(tourId, startedAt, reqLog);
}

export async function saveTourSourceImages(
  tourId: string,
  imageUrls: string[],
  mem?: MemTour,
): Promise<void> {
  const httpsUrls = imageUrls.filter((u) => u.startsWith("https://"));
  if (mem) mem.sourceImageUrls = httpsUrls;
  await persistSourceImageUrls(tourId, httpsUrls);
}
