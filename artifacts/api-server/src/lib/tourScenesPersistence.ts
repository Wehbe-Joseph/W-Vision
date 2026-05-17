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

export function queuePersistTourScenes(tourId: string): void {
  if (Date.now() < dbCircuitOpenUntil) return;
  if (pendingPersist.has(tourId)) return;
  pendingPersist.add(tourId);
  setImmediate(() => {
    pendingPersist.delete(tourId);
    const tour = getMemTour(tourId);
    if (tour && tour.scenes.length > 0) {
      void persistTourGenerationScenesToDb(tour);
    }
  });
}

/** JSON shape stored on `tours.generation_scenes` */
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

async function persistTourGenerationScenesToDb(tour: MemTour): Promise<void> {
  try {
    const payload = serializeScenes(tour.scenes);
    await db
      .update(toursTable)
      .set({
        generationScenes: payload,
        generationStatus: tour.generationStatus,
        generatedTourUrl: tour.generatedTourUrl,
        previewImageUrl: tour.previewImageUrl ?? undefined,
      })
      .where(eq(toursTable.id, tour.tourId));
  } catch (err) {
    // Open the circuit on connection errors so polling doesn't keep spamming
    // logs; the in-memory mirror is the source of truth for these tours.
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

/** Full `MemScene` rows from `tours.generation_scenes` JSON (for resume after restart). */
export function persistedScenesToMemScenes(raw: unknown): MemScene[] {
  if (!Array.isArray(raw)) return [];
  const result: MemScene[] = [];
  for (const row of raw) {
    if (!isPersistedScene(row)) continue;
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
    const operationId =
      row.operationId === null || row.operationId === undefined
        ? null
        : typeof row.operationId === "string"
          ? row.operationId
          : null;
    result.push({
      id: row.id,
      label: row.label,
      roomType: row.roomType,
      thumbnailUrl: row.thumbnailUrl,
      imageUrls,
      operationId,
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
  if (!Array.isArray(raw)) return [];
  const out: ReturnType<typeof mapDbScenesToPublicLike> = [];
  for (const row of raw) {
    if (!isPersistedScene(row)) continue;
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
