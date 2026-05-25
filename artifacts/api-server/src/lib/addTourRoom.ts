import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { tourPhotosTable, toursTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  classifyListingImages,
  filterClassificationsForTour,
  selectBestPhotoForRoom,
  type ImageClassification,
  type RoomType,
} from "../services/imageClassifier";
import { isPanoramaEligibleRoomType } from "./listingImageFilter";
import { uploadDataUrlToStorage } from "./imageStorage";
import { generatePanorama, isAiPanoramaEnabled } from "./panorama";
import {
  getMemTour,
  updateMemTour,
  rollupMemTourFromScenes,
  type MemScene,
} from "./tourMemoryStore";
import { hydrateMemTourFromDb } from "./tourGenerationDriver";
import { queuePersistTourScenes } from "./tourScenesPersistence";
import { logger } from "./logger";
import type { Request } from "express";

type ReqLog = { info: Function; warn: Function; error: Function };

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pickClassificationForNewRoom(
  items: ImageClassification[],
): ImageClassification | null {
  const strict = filterClassificationsForTour(items);
  if (strict.length > 0) return selectBestPhotoForRoom(strict);

  const relaxed = items.filter(
    (c) => c.isPropertyPhoto && c.isInterior && c.qualityScore >= 3,
  );
  if (relaxed.length > 0) return selectBestPhotoForRoom(relaxed);

  const any = items.filter((c) => c.isPropertyPhoto);
  if (any.length > 0) return selectBestPhotoForRoom(any);

  return selectBestPhotoForRoom(items);
}

function normalizeRoomTypeForPanorama(roomType: RoomType): RoomType {
  if (isPanoramaEligibleRoomType(roomType)) return roomType;
  if (roomType === "Master Bedroom") return "Bedroom";
  return "Living Room";
}

function uniqueSceneIdentity(
  scenes: MemScene[],
  roomType: string,
): { id: string; label: string } {
  const base = slugify(roomType) || "room";
  const usedIds = new Set(scenes.map((s) => s.id));
  const usedLabels = new Set(scenes.map((s) => s.label.toLowerCase()));
  let label = roomType;
  let id = base;
  let n = 2;
  while (usedIds.has(id) || usedLabels.has(label.toLowerCase())) {
    label = `${roomType} ${n}`;
    id = `${base}-${n}`;
    n += 1;
  }
  return { id, label };
}

export type AddTourRoomResult =
  | {
      ok: true;
      roomType: string;
      label: string;
      sceneId: string;
      panoramaUrl: string;
      thumbnailUrl: string;
      photoId: string;
    }
  | { ok: false; error: string; status: number };

/**
 * Classify uploaded photos with Gemini, name the room, generate 360°, persist.
 */
export async function addRoomToTour(opts: {
  tourId: string;
  userId: string;
  imageUrls?: string[];
  uploadedImages?: { name: string; dataUrl: string }[];
  req: Request;
  reqLog: ReqLog;
}): Promise<AddTourRoomResult> {
  const { tourId, userId, req, reqLog } = opts;

  let mem = getMemTour(tourId);
  if (!mem || mem.userId !== userId) {
    mem = await hydrateMemTourFromDb(tourId, userId);
  }
  if (!mem || mem.userId !== userId) {
    return { ok: false, error: "Tour not found", status: 404 };
  }

  const httpsUrls = [...(opts.imageUrls ?? []).filter((u) => u.startsWith("https://"))];
  for (const img of opts.uploadedImages ?? []) {
    const url = await uploadDataUrlToStorage(img.dataUrl, userId, req);
    if (url) httpsUrls.push(url);
  }

  if (httpsUrls.length === 0) {
    return { ok: false, error: "Upload at least one image", status: 400 };
  }

  reqLog.info({ tourId, count: httpsUrls.length }, "Adding room — classifying uploads");

  const classifications = await classifyListingImages(httpsUrls);
  const best = pickClassificationForNewRoom(classifications);
  if (!best) {
    return {
      ok: false,
      error: "Could not classify these photos as a property room",
      status: 422,
    };
  }

  const roomType = normalizeRoomTypeForPanorama(best.roomType);
  const referenceUrls = [
    best.imageUrl,
    ...classifications
      .map((c) => c.imageUrl)
      .filter((u) => u !== best.imageUrl),
  ].filter((u) => u.startsWith("http"));

  const { id: sceneId, label } = uniqueSceneIdentity(mem.scenes, roomType);

  const processingScene: MemScene = {
    id: sceneId,
    label,
    roomType,
    thumbnailUrl: best.imageUrl,
    imageUrls: referenceUrls,
    operationId: null,
    worldId: null,
    generationStatus: "processing",
    generatedTourUrl: null,
    errorMessage: null,
    locked: false,
  };
  mem.scenes.push(processingScene);
  mem.generationStatus = "processing";
  mem.currentStage = `Generating ${label}…`;
  queuePersistTourScenes(tourId);

  let panoramaUrl: string | null = null;
  if (isAiPanoramaEnabled()) {
    panoramaUrl = await generatePanorama(referenceUrls, roomType, tourId);
  } else {
    panoramaUrl = best.imageUrl;
  }

  if (!panoramaUrl) {
    processingScene.generationStatus = "failed";
    processingScene.errorMessage = "Panorama generation failed";
    rollupMemTourFromScenes(tourId);
    queuePersistTourScenes(tourId);
    return {
      ok: false,
      error: "Could not generate 360° panorama for this room",
      status: 502,
    };
  }

  processingScene.generationStatus = "completed";
  processingScene.generatedTourUrl = panoramaUrl;
  processingScene.errorMessage = null;

  let photoId = randomBytes(16).toString("hex");
  try {
    const [row] = await db
      .insert(tourPhotosTable)
      .values({
        tourId,
        originalUrl: best.imageUrl,
        thumbnailUrl: best.imageUrl,
        roomLabel: label,
        roomType,
        floorNumber: mem.scenes.length,
        qualityScore: Math.round(best.qualityScore),
        wowFactor: Math.round(best.wowFactor),
        combinedScore: best.combinedScore,
        isPropertyPhoto: best.isPropertyPhoto,
        isSelected: true,
        isBestForRoom: true,
        isAiGenerated: isAiPanoramaEnabled(),
        panoramaUrl,
        panoramaStatus: "ready",
      })
      .returning({ id: tourPhotosTable.id });
    if (row?.id) {
      photoId = row.id;
      processingScene.id = `scene-${photoId}`;
    }
  } catch (err) {
    logger.warn({ err, tourId }, "tour_photos insert for new room failed");
  }

  const roomsReady =
    mem.scenes.filter((s) => s.generationStatus === "completed").length;
  mem.roomsDetected = mem.scenes.length;
  mem.roomsReady = roomsReady;
  mem.panoramaStatus = "ready";
  rollupMemTourFromScenes(tourId);
  queuePersistTourScenes(tourId);

  try {
    await db
      .update(toursTable)
      .set({
        roomsDetected: mem.scenes.length,
        roomsReady,
        panoramaStatus: "ready",
        generationStatus: mem.generationStatus,
        currentStage: mem.currentStage,
        status: mem.generationStatus === "completed" ? "ready" : "processing",
      })
      .where(eq(toursTable.id, tourId));
  } catch {
    /* mem is source of truth for viewer polling */
  }

  reqLog.info({ tourId, roomType, label, sceneId }, "Room added to tour");

  return {
    ok: true,
    roomType,
    label,
    sceneId: `scene-${photoId}`,
    panoramaUrl,
    thumbnailUrl: best.imageUrl,
    photoId,
  };
}
