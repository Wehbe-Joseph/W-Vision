import { db } from "@workspace/db";
import { toursTable, tourPhotosTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import type { SceneGroup } from "../services/imageClassifier/grouping";
import { generatePanorama, isAiPanoramaEnabled } from "./panorama";
import {
  getMemTour,
  updateMemScene,
  rollupMemTourFromScenes,
} from "./tourMemoryStore";
import { queuePersistTourScenes } from "./tourScenesPersistence";
import { sortRoomTypes } from "./roomOrder";
import { logger } from "./logger";
import {
  FULL_HOUSE_UNLOCK_USD,
  shouldLimitToOneRoom,
} from "./tourBilling";

type ReqLog = { info: Function; warn: Function; error: Function };

async function setPhotoPanorama(
  tourId: string,
  roomType: string,
  panoramaUrl: string | null,
  status: "ready" | "failed" | "pending",
  isAiGenerated: boolean,
): Promise<void> {
  await db
    .update(tourPhotosTable)
    .set({
      panoramaUrl: panoramaUrl ?? undefined,
      panoramaStatus: status,
      isAiGenerated,
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

function sortedGroups(groups: SceneGroup[]): SceneGroup[] {
  return sortRoomTypes(groups.map((g) => ({ roomType: g.roomType, group: g }))).map(
    (x) => x.group,
  );
}

function lockDeferredRooms(tourId: string, groups: SceneGroup[]): void {
  const mem = getMemTour(tourId);
  if (!mem) return;
  const ordered = sortedGroups(groups);
  for (let i = 1; i < ordered.length; i++) {
    const g = ordered[i]!;
    const scene = mem.scenes.find((s) => s.id === g.id || s.roomType === g.roomType);
    if (scene && !scene.locked) {
      updateMemScene(tourId, scene.id, {
        locked: true,
        generationStatus: "queued",
      });
    }
  }
}

async function generateRoomPanorama(
  tourId: string,
  g: SceneGroup,
  reqLog: ReqLog,
): Promise<string | null> {
  const referenceUrls = [
    g.worldImageUrl,
    ...g.classifications
      .map((c) => c.imageUrl)
      .filter((u) => u && u !== g.worldImageUrl),
  ].filter((u): u is string => typeof u === "string" && u.startsWith("http"));

  if (isAiPanoramaEnabled()) {
    const panoramaUrl = await generatePanorama(referenceUrls, g.roomType, tourId);
    if (!panoramaUrl) {
      reqLog.warn(
        { tourId, roomType: g.roomType, refs: referenceUrls.length },
        "AI panorama failed for room",
      );
    }
    return panoramaUrl;
  }

  reqLog.info(
    { tourId, roomType: g.roomType, source: g.worldImageUrl.slice(0, 80) },
    "Using listing photo only (DISABLE_AI_PANORAMA=true)",
  );
  return g.worldImageUrl;
}

async function applyRoomResult(
  tourId: string,
  g: SceneGroup,
  panoramaUrl: string | null,
  roomsReady: number,
): Promise<number> {
  const mem = getMemTour(tourId);
  if (!mem) return roomsReady;

  if (panoramaUrl) {
    const nextReady = roomsReady + 1;
    try {
      await setPhotoPanorama(
        tourId,
        g.roomType,
        panoramaUrl,
        "ready",
        isAiPanoramaEnabled(),
      );
    } catch (err) {
      logger.warn({ err, tourId, roomType: g.roomType }, "Failed to save panorama_url");
    }

    const scene = mem.scenes.find(
      (s) => s.roomType === g.roomType || s.id === g.id,
    );
    if (scene) {
      updateMemScene(tourId, scene.id, {
        generationStatus: "completed",
        generatedTourUrl: panoramaUrl,
        errorMessage: null,
        locked: false,
      });
    }
    return nextReady;
  }

  try {
    await setPhotoPanorama(tourId, g.roomType, null, "failed", false);
  } catch {
    /* ignore */
  }
  const scene = mem.scenes.find((s) => s.roomType === g.roomType);
  if (scene) {
    updateMemScene(tourId, scene.id, {
      generationStatus: "failed",
      errorMessage: "Panorama generation failed",
    });
  }
  return roomsReady;
}

async function finalizePanoramaRun(
  tourId: string,
  totalRooms: number,
  roomsReady: number,
  previewOnly: boolean,
  reqLog: ReqLog,
): Promise<void> {
  const mem = getMemTour(tourId);
  if (!mem) return;

  const anyReady = roomsReady > 0;
  const fullHouse = mem.fullHouseUnlocked && !previewOnly;

  mem.generationStatus = anyReady ? "completed" : "failed";
  mem.panoramaStatus = anyReady ? "ready" : "failed";
  mem.pipelineStage = anyReady ? 4 : 3;

  if (anyReady) {
    mem.completedAt = Date.now();
    if (previewOnly) {
      mem.currentStage = `1 room ready — unlock full house for $${FULL_HOUSE_UNLOCK_USD}`;
    } else {
      mem.currentStage = "Tour ready";
    }
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
        isFullHouse: fullHouse,
        fullHouseUnlocked: mem.fullHouseUnlocked,
      })
      .where(eq(toursTable.id, tourId));
  } catch (err) {
    logger.warn({ err, tourId }, "Final tour panorama status not persisted");
  }

  reqLog.info(
    { tourId, roomsReady, totalRooms, previewOnly, fullHouse },
    "Panorama generation finished",
  );
}

/**
 * Generate panoramas for locked rooms after full-house unlock ($29 or paid plan).
 */
export async function runPanoramaGenerationForLockedRooms(
  tourId: string,
  groups: SceneGroup[],
  reqLog: ReqLog,
): Promise<void> {
  const mem = getMemTour(tourId);
  if (!mem || !mem.fullHouseUnlocked) return;

  const ordered = sortedGroups(groups);
  const pending = ordered.filter((g) => {
    const scene = mem.scenes.find((s) => s.id === g.id || s.roomType === g.roomType);
    return scene?.locked && scene.generationStatus !== "completed";
  });

  if (pending.length === 0) return;

  const totalRooms = mem.roomsDetected ?? ordered.length;
  let roomsReady =
    mem.roomsReady ??
    mem.scenes.filter((s) => s.generationStatus === "completed").length;

  mem.pipelineStage = 3;
  mem.generationStatus = "processing";

  for (let i = 0; i < pending.length; i++) {
    const g = pending[i]!;
    const n = roomsReady + 1;
    const stageMsg = `Generating ${g.roomType}... (${n} of ${totalRooms})`;
    mem.currentStage = stageMsg;
    queuePersistTourScenes(tourId);

    try {
      await db
        .update(toursTable)
        .set({ currentStage: stageMsg, roomsReady, generationStatus: "processing" })
        .where(eq(toursTable.id, tourId));
    } catch {
      /* ignore */
    }

    const panoramaUrl = await generateRoomPanorama(tourId, g, reqLog);
    roomsReady = await applyRoomResult(tourId, g, panoramaUrl, roomsReady);
    mem.roomsReady = roomsReady;
  }

  await finalizePanoramaRun(tourId, totalRooms, roomsReady, false, reqLog);
}

/**
 * Generate OpenAI panoramas — all rooms when unlocked, otherwise first room only (free preview).
 */
export async function runPanoramaGeneration(
  tourId: string,
  groups: SceneGroup[],
  reqLog: ReqLog,
): Promise<void> {
  const mem = getMemTour(tourId);
  if (!mem) return;

  const ordered = sortedGroups(groups);
  const previewOnly = shouldLimitToOneRoom(mem);
  const roomsToGenerate = previewOnly ? ordered.slice(0, 1) : ordered;

  if (previewOnly && ordered.length > 1) {
    lockDeferredRooms(tourId, groups);
  }

  const totalRooms = ordered.length;
  let roomsReady = 0;

  try {
    await db
      .update(toursTable)
      .set({
        panoramaStatus: "processing",
        tourType: "panorama",
        isFullHouse: !previewOnly,
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
    const n = i + 1;
    const stageMsg = previewOnly
      ? `Generating your free preview room (${g.roomType})…`
      : `Generating ${g.roomType}... (${n} of ${totalRooms})`;
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

    const panoramaUrl = await generateRoomPanorama(tourId, g, reqLog);
    roomsReady = await applyRoomResult(tourId, g, panoramaUrl, roomsReady);
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

  await finalizePanoramaRun(tourId, totalRooms, roomsReady, previewOnly, reqLog);
}
