import { db } from "@workspace/db";
import { toursTable, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
import { runPanoramaGeneration } from "./panoramaPipeline";

type ReqLog = { info: Function; warn: Function; error: Function };

function sourceUrlsFromScenes(scenes: MemScene[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scenes) {
    for (const u of s.imageUrls) {
      if (u.startsWith("https://") && !seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
  }
  return out;
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
  const sourceImageUrls = sourceUrlsFromScenes(scenes);
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
    operationId: null,
    worldId: null,
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

/** Mark unlocked scenes complete with photo thumbnails (legacy no-op path). */
export function finalizePhotoTourScenes(tourId: string): void {
  const mem = getMemTour(tourId);
  if (!mem) return;

  for (const scene of mem.scenes) {
    if (scene.locked) continue;
    updateMemScene(tourId, scene.id, {
      generationStatus: "completed",
      generatedTourUrl: null,
      operationId: null,
      errorMessage: null,
    });
  }

  mem.currentStage = "Tour ready";
  mem.generationStatus = "completed";
  if (!mem.completedAt) mem.completedAt = Date.now();
  rollupMemTourFromScenes(tourId);
  queuePersistTourScenes(tourId);
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
    mem.errorMessage = "Couldn't classify any photos for tour generation";
    queuePersistTourScenes(tourId);
    return false;
  }

  const isFree = !isPaidTier(userTier);
  const scenes: MemScene[] = groups.map((g, idx) => ({
    id: g.id,
    label: g.label,
    roomType: g.roomType,
    thumbnailUrl: g.thumbnailUrl,
    imageUrls: [g.worldImageUrl],
    operationId: null,
    worldId: null,
    generationStatus: "queued",
    generatedTourUrl: null,
    errorMessage: null,
    locked: isFree && idx > 0,
  }));

  mem.scenes = scenes;
  mem.currentStage = "Organizing rooms…";
  mem.previewImageUrl = scenes[0]?.thumbnailUrl ?? null;
  mem.generationStatus = "processing";
  queuePersistTourScenes(tourId);

  await runPanoramaGeneration(tourId, groups, userTier, reqLog);
  reqLog.info({ tourId, sceneCount: scenes.length }, "Panorama tour ready");
  return true;
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

  const imageUrls =
    mem.sourceImageUrls?.length
      ? mem.sourceImageUrls
      : mem.scenes.flatMap((s) => s.imageUrls);

  if (mem.scenes.length === 0 && imageUrls.length > 0) {
    await buildScenesFromImages(tourId, imageUrls, mem.createdOnTier, reqLog);
    return;
  }

  const refreshed = getMemTour(tourId);
  if (!refreshed || refreshed.scenes.length === 0) return;

  const needsPanorama = refreshed.scenes.some(
    (s) => !s.locked && s.generationStatus !== "completed",
  );
  if (needsPanorama && refreshed.sourceImageUrls?.length) {
    const classifications = await classifyListingImages(
      refreshed.sourceImageUrls,
    );
    const groups = groupClassificationsIntoScenes(classifications);
    if (groups.length > 0) {
      await runPanoramaGeneration(
        tourId,
        groups,
        refreshed.createdOnTier,
        reqLog,
      );
    }
  }
}

export async function saveTourSourceImages(
  _tourId: string,
  imageUrls: string[],
  mem?: MemTour,
): Promise<void> {
  const httpsUrls = imageUrls.filter((u) => u.startsWith("https://"));
  if (mem) mem.sourceImageUrls = httpsUrls;
}
