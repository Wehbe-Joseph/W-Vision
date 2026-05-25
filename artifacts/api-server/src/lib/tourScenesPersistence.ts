import { db } from "@workspace/db";
import { toursTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getMemTour, type MemTour, type MemScene } from "./tourMemoryStore";
import { logger } from "./logger";

/** Debounce DB writes — polling can hammer multiple scenes quickly. */
const pendingPersist = new Set<string>();

/**
 * When the DB has been unreachable recently, skip writes for a while so we
 * don't spam logs every poll tick. Auto-recovers after the cool-off expires.
 */
let dbCircuitOpenUntil = 0;
const DB_CIRCUIT_COOLDOWN_MS = 60_000;

/** Stored on `tours.generation_scenes` (Vercel-safe resume across serverless instances). */
export interface GenerationScenesEnvelope {
  sourceImageUrls: string[];
  scenes: PersistedMemSceneJSON[];
}

/** JSON shape for one room scene */
export interface PersistedMemSceneJSON {
  id: string;
  label: string;
  roomType: string;
  thumbnailUrl: string;
  imageUrls: string[];
  operationId: string | null;
  worldId: string | null;
  generationStatus: string;
  generatedTourUrl: string | null;
  errorMessage: string | null;
  locked?: boolean;
}

export function parseGenerationScenesPayload(raw: unknown): GenerationScenesEnvelope {
  if (Array.isArray(raw)) {
    return { sourceImageUrls: [], scenes: raw.filter(isPersistedScene) };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const sourceImageUrls = Array.isArray(o.sourceImageUrls)
      ? o.sourceImageUrls.filter((u): u is string => typeof u === "string")
      : [];
    const scenesRaw = o.scenes;
    const scenes = Array.isArray(scenesRaw)
      ? scenesRaw.filter(isPersistedScene)
      : [];
    return { sourceImageUrls, scenes };
  }
  return { sourceImageUrls: [], scenes: [] };
}

export function sourceImageUrlsFromGenerationScenes(raw: unknown): string[] {
  return parseGenerationScenesPayload(raw).sourceImageUrls;
}

function buildEnvelope(tour: MemTour): GenerationScenesEnvelope {
  return {
    sourceImageUrls: tour.sourceImageUrls ?? [],
    scenes: serializeScenes(tour.scenes),
  };
}

export function queuePersistTourScenes(tourId: string): void {
  if (Date.now() < dbCircuitOpenUntil) return;
  if (pendingPersist.has(tourId)) return;
  pendingPersist.add(tourId);
  setImmediate(() => {
    pendingPersist.delete(tourId);
    const tour = getMemTour(tourId);
    if (
      tour &&
      (tour.scenes.length > 0 || (tour.sourceImageUrls?.length ?? 0) > 0)
    ) {
      void persistTourGenerationScenesToDb(tour);
    }
  });
}

function serializeScenes(scenes: MemScene[]): PersistedMemSceneJSON[] {
  return scenes.map((s) => ({
    id: s.id,
    label: s.label,
    roomType: s.roomType,
    thumbnailUrl: s.thumbnailUrl,
    imageUrls: s.imageUrls,
    operationId: s.operationId,
    worldId: s.worldId,
    generationStatus: s.generationStatus,
    generatedTourUrl: s.generatedTourUrl,
    errorMessage: s.errorMessage,
    locked: s.locked,
  }));
}

/** Save listing photo URLs immediately so Vercel status polls can resume on a cold instance. */
export async function persistTourSourceImagesToDb(
  tourId: string,
  sourceImageUrls: string[],
  extra?: Partial<{
    generationStatus: string;
    currentStage: string;
    status: string;
  }>,
): Promise<void> {
  try {
    const envelope: GenerationScenesEnvelope = {
      sourceImageUrls,
      scenes: [],
    };
    await db
      .update(toursTable)
      .set({
        generationScenes: envelope,
        generationStatus: extra?.generationStatus,
        currentStage: extra?.currentStage,
        status: extra?.status,
      })
      .where(eq(toursTable.id, tourId));
  } catch (err) {
    logger.warn({ err, tourId }, "persistTourSourceImagesToDb failed");
  }
}

async function persistTourGenerationScenesToDb(tour: MemTour): Promise<void> {
  try {
    const payload = buildEnvelope(tour);
    await db
      .update(toursTable)
      .set({
        generationScenes: payload,
        generationStatus: tour.generationStatus,
        generatedTourUrl: tour.generatedTourUrl,
        previewImageUrl: tour.previewImageUrl ?? undefined,
        currentStage: tour.currentStage,
        roomsDetected: tour.roomsDetected,
        roomsReady: tour.roomsReady,
        panoramaStatus: tour.panoramaStatus,
        status:
          tour.generationStatus === "completed"
            ? "ready"
            : tour.generationStatus === "failed"
              ? "failed"
              : "processing",
      })
      .where(eq(toursTable.id, tour.tourId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOTFOUND|ECONNREFUSED|tenant\/user|terminating connection/i.test(msg)) {
      dbCircuitOpenUntil = Date.now() + DB_CIRCUIT_COOLDOWN_MS;
      logger.warn(
        { tourId: tour.tourId, cooldownMs: DB_CIRCUIT_COOLDOWN_MS },
        "DB unreachable — pausing scene persistence for a minute",
      );
      return;
    }
    logger.warn(
      { err, tourId: tour.tourId },
      "persist generation_scenes skipped (DB error)",
    );
  }
}

export function isPersistedScene(x: unknown): x is PersistedMemSceneJSON {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.label === "string" &&
    typeof o.roomType === "string" &&
    typeof o.thumbnailUrl === "string"
  );
}

function scenesArrayToMem(scenes: PersistedMemSceneJSON[]): MemScene[] {
  const result: MemScene[] = [];
  for (const row of scenes) {
    const gs = row.generationStatus;
    let generationStatus: MemScene["generationStatus"] = "queued";
    if (
      gs === "processing" ||
      gs === "completed" ||
      gs === "failed" ||
      gs === "queued"
    ) {
      generationStatus = gs;
    }
    const imageUrls = Array.isArray(row.imageUrls)
      ? row.imageUrls.filter((u): u is string => typeof u === "string")
      : [];
    result.push({
      id: row.id,
      label: row.label,
      roomType: row.roomType,
      thumbnailUrl: row.thumbnailUrl,
      imageUrls,
      operationId:
        row.operationId === null || row.operationId === undefined
          ? null
          : typeof row.operationId === "string"
            ? row.operationId
            : null,
      worldId: typeof row.worldId === "string" ? row.worldId : null,
      generationStatus,
      generatedTourUrl:
        typeof row.generatedTourUrl === "string" ? row.generatedTourUrl : null,
      errorMessage:
        typeof row.errorMessage === "string" ? row.errorMessage : null,
      locked: row.locked === true,
    });
  }
  return result;
}

/** Full `MemScene` rows from `tours.generation_scenes` JSON (for resume after restart). */
export function persistedScenesToMemScenes(raw: unknown): MemScene[] {
  return scenesArrayToMem(parseGenerationScenesPayload(raw).scenes);
}

/** Rehydrate scenes for public API when memory mirror is gone (server restart). */
export function mapDbScenesToPublicLike(raw: unknown): {
  id: string;
  label: string;
  roomType: string;
  thumbnailUrl: string;
  imageCount: number;
  generationStatus: MemScene["generationStatus"];
  generatedTourUrl: string | null;
  worldId: string | null;
  errorMessage: string | null;
  locked: boolean;
}[] {
  const scenes = parseGenerationScenesPayload(raw).scenes;
  const out: ReturnType<typeof mapDbScenesToPublicLike> = [];
  for (const row of scenes) {
    const gs = row.generationStatus;
    let generationStatus: MemScene["generationStatus"] = "queued";
    if (
      gs === "processing" ||
      gs === "completed" ||
      gs === "failed" ||
      gs === "queued"
    ) {
      generationStatus = gs;
    }
    const imageUrls = Array.isArray(row.imageUrls)
      ? row.imageUrls.filter((u): u is string => typeof u === "string")
      : [];
    const generatedTourUrl =
      typeof row.generatedTourUrl === "string" ? row.generatedTourUrl : null;
    const worldId = typeof row.worldId === "string" ? row.worldId : null;
    out.push({
      id: row.id,
      label: row.label,
      roomType: row.roomType,
      thumbnailUrl: row.thumbnailUrl,
      imageCount: imageUrls.length,
      generationStatus,
      generatedTourUrl,
      worldId,
      errorMessage:
        typeof row.errorMessage === "string" ? row.errorMessage : null,
      locked: row.locked === true,
    });
  }
  return out;
}
