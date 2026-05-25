import { db } from "@workspace/db";
import { toursTable, profilesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  classifyListingImages,
  filterClassificationsForTour,
  groupClassificationsIntoScenes,
} from "../services/imageClassifier";
import {
  getMemTour,
  createMemTour,
  type MemScene,
  type MemGenerationStatus,
} from "./tourMemoryStore";
import { saveTourSourceImages } from "./tourGenerationDriver";
import { saveClassifiedPhotosToDb } from "./tourPhotoPersistence";
import { runPanoramaGeneration } from "./panoramaPipeline";
import { notifyAgentTourReady } from "./tourNotify";
import { queuePersistTourScenes } from "./tourScenesPersistence";
import { logger } from "./logger";

export type PipelineStage = 1 | 2 | 3 | 4;

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  1: "Extracting photos",
  2: "Classifying rooms with AI",
  3: "Generating panoramas",
  4: "Building your tour",
};

type ReqLog = { info: Function; warn: Function; error: Function };

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function setTourStage(
  tourId: string,
  stage: PipelineStage,
  currentStage: string,
  extra?: Partial<{
    status: string;
    generationStatus: string;
    panoramaStatus: string;
    roomsDetected: number;
    roomsReady: number;
  }>,
): Promise<void> {
  const mem = getMemTour(tourId);
  if (mem) {
    mem.pipelineStage = stage;
    mem.currentStage = currentStage;
    if (extra?.roomsDetected != null) mem.roomsDetected = extra.roomsDetected;
    if (extra?.roomsReady != null) mem.roomsReady = extra.roomsReady;
  }

  try {
    await db
      .update(toursTable)
      .set({
        currentStage,
        status: extra?.status ?? "processing",
        generationStatus: extra?.generationStatus ?? "processing",
        panoramaStatus: extra?.panoramaStatus,
        roomsDetected: extra?.roomsDetected,
        roomsReady: extra?.roomsReady,
        isFullHouse: true,
        tourType: "panorama",
      })
      .where(eq(toursTable.id, tourId));
  } catch (err) {
    logger.warn({ err, tourId }, "Could not persist pipeline stage");
  }
}

function buildMemScenesFromGroups(
  groups: ReturnType<typeof groupClassificationsIntoScenes>,
): MemScene[] {
  return groups.map((g) => ({
    id: g.id,
    label: g.label,
    roomType: g.roomType,
    thumbnailUrl: g.thumbnailUrl,
    imageUrls: [g.worldImageUrl],
    operationId: null,
    worldId: null,
    generationStatus: "queued" as MemGenerationStatus,
    generatedTourUrl: null,
    errorMessage: null,
    locked: false,
  }));
}

/**
 * Full pipeline: classify → save tour_photos → panoramas (all rooms) → ready + email.
 */
export async function runFullTourPipeline(opts: {
  tourId: string;
  userId: string;
  imageUrls: string[];
  reqLog: ReqLog;
}): Promise<void> {
  const { tourId, userId, imageUrls, reqLog } = opts;
  const mem = getMemTour(tourId);
  if (!mem || mem.userId !== userId) return;

  const httpsUrls = imageUrls.filter((u) => u.startsWith("https://"));
  mem.sourceImageUrls = httpsUrls;
  await saveTourSourceImages(tourId, httpsUrls, mem);

  await setTourStage(tourId, 1, "Extracting photos…", {
    roomsDetected: httpsUrls.length,
  });

  if (httpsUrls.length === 0) {
    mem.generationStatus = "failed";
    mem.errorMessage = "No photos to process";
    await setTourStage(tourId, 4, "No photos found", {
      status: "failed",
      generationStatus: "failed",
    });
    return;
  }

  await setTourStage(tourId, 2, "Classifying rooms with AI…");

  const rawClassifications = await classifyListingImages(httpsUrls, {
    onBatch: (idx) => {
      const m = getMemTour(tourId);
      if (m) {
        m.currentStage = `Classifying rooms with AI… (batch ${idx + 1})`;
      }
    },
  });

  const filtered = filterClassificationsForTour(rawClassifications);
  const groups = groupClassificationsIntoScenes(filtered);

  if (groups.length === 0) {
    mem.generationStatus = "failed";
    mem.errorMessage =
      "No suitable property photos found after classification";
    await setTourStage(tourId, 4, mem.errorMessage, {
      status: "failed",
      generationStatus: "failed",
    });
    return;
  }

  try {
    await saveClassifiedPhotosToDb(tourId, filtered, groups);
  } catch (err) {
    reqLog.warn({ err, tourId }, "tour_photos save failed — continuing in memory");
  }

  mem.scenes = buildMemScenesFromGroups(groups);
  mem.roomsDetected = groups.length;
  mem.previewImageUrl = groups[0]?.thumbnailUrl ?? null;
  mem.generationStatus = "processing";
  queuePersistTourScenes(tourId);

  await setTourStage(tourId, 3, "Generating panoramas…", {
    roomsDetected: groups.length,
    roomsReady: 0,
    panoramaStatus: "processing",
  });

  await runPanoramaGeneration(tourId, groups, reqLog);

  await setTourStage(tourId, 4, mem.currentStage ?? "Building your tour…");

  const after = getMemTour(tourId);
  if (after?.generationStatus === "completed") {
    after.pipelineStage = 4;
    after.currentStage = "Tour ready";
    try {
      await db
        .update(toursTable)
        .set({
          status: "ready",
          currentStage: "Tour ready",
        })
        .where(eq(toursTable.id, tourId));
    } catch {
      /* mem is enough */
    }
    void notifyAgentTourReady(tourId).catch((err) => {
      reqLog.warn({ err, tourId }, "Tour-ready notification failed");
    });

    try {
      await db
        .update(profilesTable)
        .set({
          toursThisMonth: sql`tours_this_month + 1`,
          totalTours: sql`total_tours + 1`,
        })
        .where(eq(profilesTable.id, userId));
    } catch {
      reqLog.warn({ tourId }, "Profile tour counter update skipped");
    }
  }

  reqLog.info({ tourId, rooms: groups.length }, "Full tour pipeline finished");
}

/** Re-export for status serialization */
export { slugify };
