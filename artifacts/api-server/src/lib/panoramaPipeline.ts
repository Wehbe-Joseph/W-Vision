import { db } from "@workspace/db";
import { toursTable, tourPhotosTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import type { SceneGroup } from "../services/imageClassifier/grouping";
import { selectBestPhotoForRoom } from "../services/imageClassifier/grouping";
import { generatePanorama } from "./panorama";
import {
  getMemTour,
  updateMemScene,
  rollupMemTourFromScenes,
} from "./tourMemoryStore";
import { queuePersistTourScenes } from "./tourScenesPersistence";
import { sortRoomTypes } from "./roomOrder";
import { logger } from "./logger";

type ReqLog = { info: Function; warn: Function; error: Function };

async function setPhotoPanorama(
  tourId: string,
  roomType: string,
  panoramaUrl: string | null,
  status: "ready" | "failed" | "pending",
): Promise<void> {
  await db
    .update(tourPhotosTable)
    .set({
      panoramaUrl: panoramaUrl ?? undefined,
      panoramaStatus: status,
    })
    .where(
      and(
        eq(tourPhotosTable.tourId, tourId),
        or(
          eq(tourPhotosTable.roomType, roomType),
          eq(tourPhotosTable.roomLabel, roomType),
        ),
        eq(tourPhotosTable.isBestForRoom, true),
      ),
    );
}

/**
 * Generate OpenAI panoramas for every room (sequential, full house).
 */
export async function runPanoramaGeneration(
  tourId: string,
  groups: SceneGroup[],
  reqLog: ReqLog,
): Promise<void> {
  const mem = getMemTour(tourId);
  if (!mem) return;

  const roomsToGenerate = sortRoomTypes(
    groups.map((g) => ({ roomType: g.roomType, group: g })),
  ).map((x) => x.group);

  const totalRooms = roomsToGenerate.length;
  let roomsReady = 0;

  try {
    await db
      .update(toursTable)
      .set({
        panoramaStatus: "processing",
        tourType: "panorama",
        isFullHouse: true,
        roomsReady: 0,
        roomsDetected: totalRooms,
        generationStatus: "processing",
        status: "processing",
      })
      .where(eq(toursTable.id, tourId));
  } catch {
    /* continue */
  }

  mem.pipelineStage = 3;
  mem.roomsDetected = totalRooms;

  for (let i = 0; i < roomsToGenerate.length; i++) {
    const g = roomsToGenerate[i]!;
    const roomType = g.roomType;
    const imageUrl = g.worldImageUrl;
    const n = i + 1;

    const stageMsg = `Generating ${roomType}... (${n} of ${totalRooms})`;
    mem.currentStage = stageMsg;
    mem.roomsReady = roomsReady;
    queuePersistTourScenes(tourId);

    try {
      await db
        .update(toursTable)
        .set({ currentStage: stageMsg, roomsReady })
        .where(eq(toursTable.id, tourId));
    } catch {
      /* ignore */
    }

    const panoramaUrl = await generatePanorama(imageUrl, roomType, tourId);

    if (panoramaUrl) {
      roomsReady += 1;
      try {
        await setPhotoPanorama(tourId, roomType, panoramaUrl, "ready");
      } catch (err) {
        reqLog.warn({ err, tourId, roomType }, "Failed to save panorama_url");
      }

      const scene = mem.scenes.find(
        (s) => s.roomType === roomType || s.id === g.id,
      );
      if (scene) {
        updateMemScene(tourId, scene.id, {
          generationStatus: "completed",
          generatedTourUrl: panoramaUrl,
          errorMessage: null,
        });
      }
    } else {
      try {
        await setPhotoPanorama(tourId, roomType, null, "failed");
      } catch {
        /* ignore */
      }
      const scene = mem.scenes.find((s) => s.roomType === roomType);
      if (scene) {
        updateMemScene(tourId, scene.id, {
          generationStatus: "failed",
          errorMessage: "Panorama generation failed",
        });
      }
      reqLog.warn({ tourId, roomType }, "Panorama skipped — continuing");
    }

    mem.roomsReady = roomsReady;
    try {
      await db
        .update(toursTable)
        .set({ roomsReady, currentStage: mem.currentStage })
        .where(eq(toursTable.id, tourId));
    } catch {
      /* ignore */
    }
  }

  const anyReady = roomsReady > 0;
  mem.generationStatus = anyReady ? "completed" : "failed";
  mem.panoramaStatus = anyReady ? "ready" : "failed";
  mem.pipelineStage = anyReady ? 4 : 3;

  if (anyReady) {
    mem.completedAt = Date.now();
    mem.currentStage = "Tour ready";
    mem.generatedTourUrl =
      mem.scenes.find((s) => s.generatedTourUrl)?.generatedTourUrl ?? null;
    mem.previewImageUrl =
      mem.previewImageUrl ?? mem.scenes[0]?.thumbnailUrl ?? null;
  } else {
    mem.errorMessage = "Could not generate any panoramas";
    mem.currentStage = "Some rooms could not be generated";
  }

  rollupMemTourFromScenes(tourId);
  queuePersistTourScenes(tourId);

  try {
    await db
      .update(toursTable)
      .set({
        status: anyReady ? "ready" : "failed",
        panoramaStatus: anyReady ? "ready" : "failed",
        generationStatus: anyReady ? "completed" : "failed",
        roomsReady,
        roomsDetected: totalRooms,
        processingCompletedAt: anyReady ? new Date() : undefined,
        currentStage: mem.currentStage,
        generatedTourUrl: mem.generatedTourUrl,
        previewImageUrl: mem.previewImageUrl ?? undefined,
        errorMessage: anyReady ? null : mem.errorMessage,
        isFullHouse: true,
      })
      .where(eq(toursTable.id, tourId));
  } catch (err) {
    logger.warn({ err, tourId }, "Final tour panorama status not persisted");
  }

  reqLog.info({ tourId, roomsReady, totalRooms }, "Panorama generation finished");
}
