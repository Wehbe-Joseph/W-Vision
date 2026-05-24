/**
 * In-memory tour generation state.
 *
 * This is intentionally a parallel store to the `tours` Postgres table — when
 * the DB is unreachable (wrong region, paused project, network blip…), the
 * generation flow still works end-to-end: we create a tour id, classify photos,
 * and let the frontend poll the status endpoint backed by this map.
 */

export type MemGenerationStatus = "queued" | "processing" | "completed" | "failed";

/**
 * One room in the tour (Living Room, Master Bedroom, …). Each scene stores
 * the best photo thumbnail for that room.
 */
export interface MemScene {
  id: string;
  label: string;
  roomType: string;
  thumbnailUrl: string;
  imageUrls: string[];
  operationId: string | null;
  worldId: string | null;
  generationStatus: MemGenerationStatus;
  generatedTourUrl: string | null;
  errorMessage: string | null;
  /**
   * True when this scene is locked behind the free tier until upgrade.
   */
  locked: boolean;
}

export interface MemTour {
  tourId: string;
  userId: string;
  shareToken: string;
  listingUrl: string;
  listingAddress: string;
  listingPlatform: string;
  operationId: string | null;
  worldId: string | null;
  generationStatus: MemGenerationStatus;
  currentStage: string;
  generatedTourUrl: string | null;
  previewImageUrl: string | null;
  errorMessage: string | null;
  imageCount: number;
  viewCount: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  /** ms epoch when the tour stops being viewable (null = never). */
  expiresAt: number | null;
  /** True once the expiry has passed and we've frozen the tour. */
  frozen: boolean;
  /** Tier at the time the tour was created — used to render the upgrade CTA. */
  createdOnTier: "free" | "pro" | "unlimited";
  /** One scene per room (filled after Gemini classification). */
  scenes: MemScene[];
  /** Original listing/upload URLs used to start generation (persisted for serverless resume). */
  sourceImageUrls?: string[];
}

const TOURS = new Map<string, MemTour>();
// Soft cap so a long-running process doesn't grow unbounded.
const MAX_ENTRIES = 1000;

function evictIfNeeded() {
  if (TOURS.size <= MAX_ENTRIES) return;
  const sorted = [...TOURS.entries()].sort(
    (a, b) => a[1].updatedAt - b[1].updatedAt,
  );
  const toRemove = sorted.slice(0, sorted.length - MAX_ENTRIES);
  for (const [id] of toRemove) TOURS.delete(id);
}

export function createMemTour(init: Omit<MemTour, "createdAt" | "updatedAt">): MemTour {
  const now = Date.now();
  const tour: MemTour = { ...init, createdAt: now, updatedAt: now };
  TOURS.set(tour.tourId, tour);
  evictIfNeeded();
  return tour;
}

export function getMemTour(tourId: string): MemTour | undefined {
  return TOURS.get(tourId);
}

export function updateMemTour(
  tourId: string,
  patch: Partial<Omit<MemTour, "tourId" | "createdAt">>,
): MemTour | undefined {
  const tour = TOURS.get(tourId);
  if (!tour) return undefined;
  Object.assign(tour, patch, { updatedAt: Date.now() });
  if (patch.generationStatus === "completed" && !tour.completedAt) {
    tour.completedAt = Date.now();
  }
  return tour;
}

export function deleteMemTour(tourId: string): boolean {
  return TOURS.delete(tourId);
}

/** Patch a single scene inside a tour. */
export function updateMemScene(
  tourId: string,
  sceneId: string,
  patch: Partial<Omit<MemScene, "id">>,
): MemScene | undefined {
  const tour = TOURS.get(tourId);
  if (!tour) return undefined;
  const scene = tour.scenes.find((s) => s.id === sceneId);
  if (!scene) return undefined;
  Object.assign(scene, patch);
  tour.updatedAt = Date.now();
  return scene;
}

/** True when the URL points at a Gaussian splat asset Spark can load. */
function isSpzAssetUrl(url: string | null | undefined): boolean {
  return !!url && /\.spz(\?|$)/i.test(url);
}

/**
 * Recompute the parent tour's overall generationStatus from its scenes.
 *   - any FAILED + no in-flight  -> failed (only if no completed siblings)
 *   - all COMPLETED              -> completed
 *   - any PROCESSING             -> processing
 *   - else                       -> queued
 *
 * We also bubble up the first completed scene's URL as the legacy
 * `generatedTourUrl` so older clients keep working.
 */
export function rollupMemTourFromScenes(tourId: string): MemTour | undefined {
  const tour = TOURS.get(tourId);
  if (!tour || tour.scenes.length === 0) return tour;

  // Locked scenes are intentionally deferred (free tier) — they should not
  // block the parent tour from being marked complete.
  const active = tour.scenes.filter((s) => !s.locked);
  const statuses = (active.length > 0 ? active : tour.scenes).map(
    (s) => s.generationStatus,
  );
  let next: MemGenerationStatus;
  if (statuses.every((s) => s === "completed")) next = "completed";
  else if (statuses.some((s) => s === "processing" || s === "queued"))
    next = "processing";
  else if (statuses.some((s) => s === "completed")) next = "completed";
  else next = "failed";

  tour.generationStatus = next;
  if (next === "completed" && !tour.completedAt) tour.completedAt = Date.now();

  const firstReady = tour.scenes.find((s) => s.generationStatus === "completed");
  if (firstReady) {
    tour.generatedTourUrl = isSpzAssetUrl(firstReady.generatedTourUrl)
      ? firstReady.generatedTourUrl
      : null;
    tour.previewImageUrl = firstReady.thumbnailUrl ?? tour.previewImageUrl;
  }
  if (next === "completed") {
    tour.currentStage = "Tour ready";
  }
  tour.updatedAt = Date.now();
  return tour;
}

export function listMemToursForUser(
  userId: string,
  opts?: { status?: "all" | "ready" | "processing" | "failed"; search?: string },
): MemTour[] {
  const status = opts?.status ?? "all";
  const search = (opts?.search ?? "").trim().toLowerCase();
  return [...TOURS.values()]
    .filter((t) => t.userId === userId)
    .filter((t) => {
      if (status === "all") return true;
      if (status === "ready") return t.generationStatus === "completed";
      if (status === "processing")
        return (
          t.generationStatus === "queued" || t.generationStatus === "processing"
        );
      if (status === "failed") return t.generationStatus === "failed";
      return true;
    })
    .filter((t) => {
      if (!search) return true;
      return (
        t.listingAddress.toLowerCase().includes(search) ||
        t.listingUrl.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function memTourCountThisMonthForUser(userId: string): number {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return [...TOURS.values()].filter(
    (t) => t.userId === userId && t.createdAt >= startOfMonth,
  ).length;
}

export function memTotalToursForUser(userId: string): number {
  return [...TOURS.values()].filter((t) => t.userId === userId).length;
}

export function memAvgProcessingMinutesForUser(userId: string): number {
  const completed = [...TOURS.values()].filter(
    (t) =>
      t.userId === userId &&
      t.generationStatus === "completed" &&
      t.completedAt !== null,
  );
  if (completed.length === 0) return 0;
  const totalMs = completed.reduce(
    (s, t) => s + ((t.completedAt ?? t.updatedAt) - t.createdAt),
    0,
  );
  return Math.round(totalMs / completed.length / 1000 / 60);
}

export function memTotalViewsForUser(userId: string): number {
  return [...TOURS.values()]
    .filter((t) => t.userId === userId)
    .reduce((s, t) => s + t.viewCount, 0);
}

/** Find a tour by its public share token. */
export function findMemTourByShareToken(token: string): MemTour | undefined {
  for (const tour of TOURS.values()) {
    if (tour.shareToken === token) return tour;
  }
  return undefined;
}

/**
 * Flip `frozen` on any tour whose `expiresAt` has passed. Called both on
 * read paths (so a stale row still surfaces the right state) and from a
 * periodic sweep so the dashboard view counters update too.
 */
export function refreshTourExpiry(tour: MemTour, now = Date.now()): MemTour {
  if (!tour.frozen && tour.expiresAt !== null && now >= tour.expiresAt) {
    tour.frozen = true;
    tour.updatedAt = now;
  }
  return tour;
}

export function sweepExpiredTours(now = Date.now()): number {
  let froze = 0;
  for (const tour of TOURS.values()) {
    const wasFrozen = tour.frozen;
    refreshTourExpiry(tour, now);
    if (!wasFrozen && tour.frozen) froze += 1;
  }
  return froze;
}

/**
 * Unfreeze every tour belonging to a user and remove their expiry (e.g.
 * after upgrading to a paid plan).
 */
export function unfreezeAllToursForUser(userId: string): number {
  let count = 0;
  for (const tour of TOURS.values()) {
    if (tour.userId !== userId) continue;
    if (tour.frozen || tour.expiresAt !== null) {
      tour.frozen = false;
      tour.expiresAt = null;
      tour.updatedAt = Date.now();
      count += 1;
    }
  }
  return count;
}
