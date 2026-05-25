import { db } from "@workspace/db";
import { toursTable, tourPhotosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { SceneGroup } from "../services/imageClassifier/grouping";
import { selectBestPhotoForRoom } from "../services/imageClassifier/grouping";
import { generatePanorama } from "./panorama";
import {
  getMemTour,
  updateMemScene,
  rollupMemTourFromScenes,
  type MemScene,
} from "./tourMemoryStore";
import { queuePersistTourScenes } from "./tourScenesPersistence";
import { isPaidTier, type SubscriptionTier } from "./userMemoryStore";
import { logger } from "./logger";

type ReqLog = { info: Function; warn: Function; error: Function };

function bestCombinedScore(group: SceneGroup): number {
  const best = selectBestPhotoForRoom(group.classifications);
  return best?.combinedScore ?? 0;
}

async function upsertBestPhotoRows(
  tourId: string,
  groups: SceneGroup[],
): Promise<void> {
  for (const g of groups) {
    const best = selectBestPhotoForRoom(g.classifications);
    if (!best) continue;

    const existing = await db
      .select({ id: tourPhotosTable.id })
      .from(tourPhotosTable)
      .where(
        and(
          eq(tourPhotosTable.tourId, tourId),
          eq(tourPhotosTable.roomLabel, g.roomType),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(tourPhotosTable)
        .set({
          originalUrl: best.imageUrl,
          thumbnailUrl: best.imageUrl,
          isBestForRoom: true,
          qualityScore: Math.round(best.qualityScore),
          confidenceScore: best.confidence,
          panoramaStatus: "pending",
        })
        .where(eq(tourPhotosTable.id, existing[0].id));
    } else {
      await db.insert(tourPhotosTable).values({
        tourId,
        roomLabel: g.roomType,
        originalUrl: best.imageUrl,
        thumbnailUrl: best.imageUrl,
        floorNumber: 1,
        qualityScore: Math.round(best.qualityScore),
        isSelected: true,
        isBestForRoom: true,
        confidenceScore: best.confidence,
        panoramaStatus: "pending",
      });
    }
  }
}

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
        eq(tourPhotosTable.roomLabel, roomType),
        eq(tourPhotosTable.isBestForRoom, true),
      ),
    );
}

/**
 * After Gemini classification: generate OpenAI panoramas per tier,
 * update tour_photos + tours, and sync mem scenes with panorama URLs.
 */
export async function runPanoramaGeneration(
  tourId: string,
  groups: SceneGroup[],
  userTier: SubscriptionTier,
  reqLog: ReqLog,
): Promise<void> {
  const mem = getMemTour(tourId);
  if (!mem) return;

  const isPaid = isPaidTier(userTier);
  const sorted = [...groups].sort(
    (a, b) => bestCombinedScore(b) - bestCombinedScore(a),
  );
  const roomsToGenerate = isPaid ? sorted : sorted.slice(0, 1);
  const totalRooms = roomsToGenerate.length;

  try {
    await upsertBestPhotoRows(tourId, groups);
  } catch (err) {
    reqLog.warn({ err, tourId }, "Could not upsert tour_photos — continuing");
  }

  await db
    .update(toursTable)
    .set({
      panoramaStatus: "processing",
      tourType: "panorama",
      isFullHouse: isPaid,
      roomsReady: 0,
      generationStatus: "processing",
      status: "processing",
    })
    .where(eq(toursTable.id, tourId));

  let roomsReady = 0;

  for (let i = 0; i < roomsToGenerate.length; i++) {
    const g = roomsToGenerate[i]!;
    const imageUrl = g.worldImageUrl;
    const roomType = g.roomType;

    mem.currentStage = `Generating 360° panorama for ${roomType}…`;
    queuePersistTourScenes(tourId);

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

      mem.currentStage =
        totalRooms > 1
          ? `Generated ${roomType} — ${roomsReady} of ${totalRooms} rooms complete`
          : `Generated ${roomType}`;
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
      reqLog.warn({ tourId, roomType }, "Panorama generation returned null");
    }

    try {
      await db
        .update(toursTable)
        .set({
          roomsReady,
          currentStage: mem.currentStage,
        })
        .where(eq(toursTable.id, tourId));
    } catch {
      /* memory is source of truth during outage */
    }
  }

  const anyReady = roomsReady > 0;
  mem.roomsReady = roomsReady;
  mem.generationStatus = anyReady ? "completed" : "failed";
  mem.panoramaStatus = anyReady ? "ready" : "failed";
  if (anyReady) {
    mem.completedAt = Date.now();
    mem.currentStage = "Tour ready";
    mem.generatedTourUrl =
      mem.scenes.find((s) => s.generatedTourUrl)?.generatedTourUrl ?? null;
    mem.previewImageUrl =
      mem.previewImageUrl ?? mem.scenes[0]?.thumbnailUrl ?? null;
  } else {
    mem.errorMessage = "Could not generate any panoramas";
    mem.currentStage = "Generation failed";
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
        processingCompletedAt: anyReady ? new Date() : undefined,
        currentStage: mem.currentStage,
        generatedTourUrl: mem.generatedTourUrl,
        previewImageUrl: mem.previewImageUrl ?? undefined,
        errorMessage: anyReady ? null : mem.errorMessage,
      })
      .where(eq(toursTable.id, tourId));
  } catch (err) {
    logger.warn({ err, tourId }, "Final tour panorama status not persisted");
  }

  reqLog.info(
    { tourId, roomsReady, totalRooms, isPaid },
    "Panorama generation finished",
  );
}
