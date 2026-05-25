import { db } from "@workspace/db";
import { toursTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createMemTour,
  getMemTour,
  type MemTour,
  type MemGenerationStatus,
} from "./tourMemoryStore";
import {
  persistedScenesToMemScenes,
  sourceImageUrlsFromGenerationScenes,
} from "./tourScenesPersistence";
import { logger } from "./logger";
import { runFullTourPipeline } from "./tourPipeline";
import { runPanoramaGeneration } from "./panoramaPipeline";
import type { SceneGroup } from "../services/imageClassifier/grouping";
import type { RoomType } from "../services/imageClassifier/gemini";

type ReqLog = { info: Function; warn: Function; error: Function };

function sourceUrlsFromScenes(
  scenes: ReturnType<typeof persistedScenesToMemScenes>,
): string[] {
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

function scenesToGroups(mem: MemTour): SceneGroup[] {
  return mem.scenes.map((s) => ({
    id: s.id,
    label: s.label,
    roomType: s.roomType as RoomType,
    thumbnailUrl: s.thumbnailUrl,
    worldImageUrl: s.imageUrls[0] ?? s.thumbnailUrl,
    classifications: [],
    recommendedFor3d: true,
  }));
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
  const persistedSources = sourceImageUrlsFromGenerationScenes(
    tour.generationScenes,
  );
  const sourceImageUrls =
    persistedSources.length > 0 ? persistedSources : sourceUrlsFromScenes(scenes);
  const gs = tour.generationStatus;
  const generationStatus: MemGenerationStatus =
    gs === "queued" || gs === "processing" || gs === "completed" || gs === "failed"
      ? gs
      : "processing";

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
    createdOnTier: "unlimited",
    scenes,
    sourceImageUrls,
    roomsDetected: tour.roomsDetected ?? scenes.length,
    roomsReady: tour.roomsReady ?? 0,
    pipelineStage:
      generationStatus === "completed"
        ? 4
        : scenes.length > 0
          ? 3
          : 1,
  });
  return mem;
}

/**
 * Advance tour generation on each status poll — required on Vercel serverless.
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

  if (imageUrls.length === 0) return;

  if (mem.scenes.length === 0) {
    await runFullTourPipeline({ tourId, userId, imageUrls, reqLog });
    return;
  }

  const needsPanorama = mem.scenes.some(
    (s) => s.generationStatus !== "completed",
  );
  if (needsPanorama) {
    const groups = scenesToGroups(mem);
    await runPanoramaGeneration(tourId, groups, reqLog);
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

/** @deprecated Legacy export */
export function finalizePhotoTourScenes(_tourId: string): void {
  /* no-op */
}
