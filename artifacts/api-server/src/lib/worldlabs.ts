import { randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { toursTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import {
  getMemTour,
  updateMemTour,
  updateMemScene,
  rollupMemTourFromScenes,
} from "./tourMemoryStore";
import { queuePersistTourScenes } from "./tourScenesPersistence";
import { mirrorSpzToSupabase, isSplatStorageConfigured } from "./supabaseSpzMirror";
import { saveTourPhotoWorldEmbed } from "./tourPhotoWorldEmbed";

/**
 * Poll keys are `tourId` or `tourId::sceneId`. We support both so a single
 * tour can run many Marble worlds in parallel (one per room).
 */
function splitPollKey(key: string): { tourId: string; sceneId: string | null } {
  const idx = key.indexOf("::");
  if (idx === -1) return { tourId: key, sceneId: null };
  return { tourId: key.slice(0, idx), sceneId: key.slice(idx + 2) };
}

// ─── Config ───────────────────────────────────────────────────────────────────
//
// World Labs / Marble API. The current public API lives under
// `/marble/v1` and uses a `WLT-Api-Key` header for auth. See
// https://docs.worldlabs.ai/api for the latest reference.

const WORLDLABS_API_BASE = "https://api.worldlabs.ai";
const WORLDLABS_API_KEY = process.env.WORLD_LABS_API_KEY ?? "";
const MARBLE_MODEL = process.env.WORLD_LABS_MODEL ?? "marble-1.1";

/** Prefix for synthetic operation ids when Marble is turned off for local testing. */
export const WORLD_LABS_DRY_RUN_PREFIX = "dry-run:";

/**
 * When false, `createWorld` never calls Marble (no credits). Polling resolves
 * immediately with no embed URL. Set `WORLD_LABS_ENABLED=false` in `.env`.
 */
export function isWorldLabsEnabled(): boolean {
  const v = (process.env.WORLD_LABS_ENABLED ?? "true").toLowerCase().trim();
  return v !== "false" && v !== "0" && v !== "no" && v !== "off";
}

export function isDryRunOperationId(operationId: string): boolean {
  return operationId.startsWith(WORLD_LABS_DRY_RUN_PREFIX);
}

const POLL_INTERVAL_MS = 8000;
const MAX_RETRIES = 3;
const MAX_POLL_DURATION_MS = 30 * 60 * 1000; // 30 min upper bound

// ─── Types ────────────────────────────────────────────────────────────────────

type ProgressStatus = "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED";

interface MarbleOperation {
  operation_id: string;
  done: boolean;
  error: { message?: string; code?: number | string } | null;
  metadata: {
    progress?: {
      status: ProgressStatus;
      description?: string;
    };
    world_id?: string;
  } | null;
  response: MarbleWorld | null;
}

interface MarbleWorld {
  id: string;
  display_name: string | null;
  world_marble_url?: string;
  spz_url?: string;
  download_url?: string;
  /** Some API versions expose a direct SPZ export URL here. */
  exports?: { spz_url?: string };
  assets?: {
    caption?: string;
    thumbnail_url?: string;
    splats?: {
      spz_urls?: {
        "100k"?: string;
        "500k"?: string;
        full_res?: string;
      };
    };
    mesh?: { collider_mesh_url?: string };
    imagery?: { pano_url?: string };
  };
}

/** HTTPS URL to download the finished Gaussian splat (.spz) — never a viewer page. */
function extractSplatSourceUrl(world: MarbleWorld | null): string | null {
  if (!world) return null;
  const ex = world.exports?.spz_url;
  if (typeof ex === "string" && ex.startsWith("http")) return ex;
  if (typeof world.spz_url === "string" && world.spz_url.startsWith("http")) {
    return world.spz_url;
  }
  if (
    typeof world.download_url === "string" &&
    world.download_url.startsWith("http")
  ) {
    return world.download_url;
  }
  const spz = world.assets?.splats?.spz_urls;
  return spz?.full_res ?? spz?.["500k"] ?? spz?.["100k"] ?? null;
}

export interface CreateWorldResult {
  /** Long-running operation id returned by `worlds:generate`. */
  operationId: string;
}

interface WorldStatusResult {
  generationStatus: "queued" | "processing" | "completed" | "failed";
  worldlabsStatus: ProgressStatus | "UNKNOWN";
  /** World Labs world id (internal). */
  worldId: string | null;
  /** Temporary HTTPS URL to the SPZ on World Labs' CDN — mirror to Supabase Storage before exposing to browsers. */
  splatSourceUrl: string | null;
  previewImageUrl: string | null;
  error: string | null;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  return {
    "WLT-Api-Key": WORLDLABS_API_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function mapProgress(s: ProgressStatus | undefined): WorldStatusResult["generationStatus"] {
  switch (s) {
    case "PENDING":
      return "queued";
    case "IN_PROGRESS":
      return "processing";
    case "SUCCEEDED":
      return "completed";
    case "FAILED":
      return "failed";
    default:
      return "queued";
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Kick off a new world generation from one or more publicly-fetchable image
 * URLs. Returns the long-running operation id to poll.
 *
 * The API supports up to multiple images via the `multi-image` prompt.
 * Marble expects a `world_prompt` payload — NOT the older `generation_input`
 * shape that previously lived in this file (which is why prod traffic was
 * silently 404-ing for months).
 */
export async function createWorld(imageUrls: string[]): Promise<CreateWorldResult> {
  // Marble caps multi-image prompts; trim defensively.
  const usable = imageUrls.filter((u) => !!u && u.startsWith("https://")).slice(0, 8);
  if (usable.length === 0) {
    throw new Error("At least one public https:// image URL is required");
  }

  if (!isWorldLabsEnabled()) {
    const operationId = `${WORLD_LABS_DRY_RUN_PREFIX}${randomBytes(16).toString("hex")}`;
    logger.warn(
      { operationId },
      "World Labs disabled (WORLD_LABS_ENABLED=false) — skipping worlds:generate; no Marble credits used",
    );
    return { operationId };
  }

  if (!WORLDLABS_API_KEY) {
    throw new Error("WORLD_LABS_API_KEY is not configured");
  }

  let worldPrompt: Record<string, unknown>;
  if (usable.length === 1) {
    worldPrompt = {
      type: "image",
      image_prompt: { source: "uri", uri: usable[0] },
    };
  } else {
    // Let the spatial AI engine infer relative camera placement via
    // automatic layout. We intentionally omit azimuth values here.
    worldPrompt = {
      type: "multi-image",
      multi_image_prompt: usable.map((uri) => ({
        content: { source: "uri", uri },
      })),
    };
  }

  const body = {
    display_name: "TourVision listing",
    model: MARBLE_MODEL,
    world_prompt: worldPrompt,
    // Marble worlds are private by default. Make them public so the
    // share link works without the viewer needing a worldlabs.ai account
    // with explicit access. Anyone with the URL can view, no edit.
    permission: { public: true },
  };

  const res = await fetch(`${WORLDLABS_API_BASE}/marble/v1/worlds:generate`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `WorldLabs API error ${res.status}: ${errBody || res.statusText}`,
    );
  }

  const data = (await res.json()) as MarbleOperation;
  if (!data.operation_id) {
    throw new Error("WorldLabs API did not return an operation_id");
  }

  return { operationId: data.operation_id };
}

/** Poll a generation operation. Translates Marble's progress state into the
 *  internal `generationStatus` enum used everywhere in the tours table. */
export async function getOperationStatus(
  operationId: string,
): Promise<WorldStatusResult> {
  if (isDryRunOperationId(operationId)) {
    return {
      generationStatus: "completed",
      worldlabsStatus: "SUCCEEDED",
      worldId: null,
      splatSourceUrl: null,
      previewImageUrl: null,
      error: null,
    };
  }

  const res = await fetch(
    `${WORLDLABS_API_BASE}/marble/v1/operations/${encodeURIComponent(operationId)}`,
    { headers: authHeaders() },
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `WorldLabs status check error ${res.status}: ${errBody || res.statusText}`,
    );
  }

  const op = (await res.json()) as MarbleOperation;
  const progress = op.metadata?.progress?.status;
  const worldId = op.metadata?.world_id ?? op.response?.id ?? null;

  // Marble's real responses don't always populate `metadata.progress.status`.
  // Once `done` is true (and there's no error) the operation succeeded; while
  // `done` is false but Marble has assigned a `world_id`, the build is in
  // flight. Otherwise we fall back to whatever progress label was returned.
  let generationStatus: WorldStatusResult["generationStatus"];
  if (op.done && op.error) {
    generationStatus = "failed";
  } else if (op.done) {
    generationStatus = "completed";
  } else if (worldId) {
    generationStatus = "processing";
  } else {
    generationStatus = mapProgress(progress);
  }

  const splatSourceUrl =
    generationStatus === "completed" && !op.error
      ? extractSplatSourceUrl(op.response)
      : null;

  const previewImageUrl =
    op.response?.assets?.thumbnail_url ??
    op.response?.assets?.imagery?.pano_url ??
    null;

  const error =
    op.error?.message ??
    (generationStatus === "failed"
      ? op.metadata?.progress?.description ?? "World generation failed"
      : null);

  return {
    generationStatus,
    worldlabsStatus: progress ?? "UNKNOWN",
    worldId,
    splatSourceUrl,
    previewImageUrl,
    error: generationStatus === "failed" ? error : null,
  };
}

// ─── Background polling ───────────────────────────────────────────────────────

const activePollTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function schedulePoll(
  tourId: string,
  operationId: string,
  startedAt: Date,
) {
  if (process.env.VERCEL) {
    // Serverless: status polls drive advancement — no background timers.
    return;
  }
  if (activePollTimers.has(tourId)) return;
  doSchedule(tourId, operationId, startedAt);
}

/** Run one World Labs poll cycle (used by status-driven generation on Vercel). */
export async function pollOperationNow(
  pollKey: string,
  operationId: string,
  startedAt: Date,
): Promise<void> {
  await pollTour(pollKey, operationId, startedAt);
}

function doSchedule(tourId: string, operationId: string, startedAt: Date) {
  const delayMs = isDryRunOperationId(operationId) ? 0 : POLL_INTERVAL_MS;
  const handle = setTimeout(() => {
    activePollTimers.delete(tourId);
    pollTour(tourId, operationId, startedAt).catch((err) => {
      logger.error({ err, tourId }, "Poll error");
    });
  }, delayMs);
  activePollTimers.set(tourId, handle);
}

async function safeDbUpdate(
  tourId: string,
  values: Parameters<ReturnType<typeof db.update<typeof toursTable>>["set"]>[0],
  context: string,
): Promise<void> {
  try {
    await db.update(toursTable).set(values).where(eq(toursTable.id, tourId));
  } catch (err) {
    logger.warn({ err, tourId, context }, "DB update skipped (DB unavailable)");
  }
}

async function pollTour(
  pollKey: string,
  operationId: string,
  startedAt: Date,
): Promise<void> {
  const { tourId, sceneId } = splitPollKey(pollKey);
  const elapsed = Date.now() - startedAt.getTime();
  const memTour = getMemTour(tourId);

  if (elapsed > MAX_POLL_DURATION_MS) {
    logger.warn({ tourId, sceneId }, "Tour generation timed out");
    if (sceneId) {
      updateMemScene(tourId, sceneId, {
        generationStatus: "failed",
        errorMessage: "Generation timed out after 30 minutes",
      });
      rollupMemTourFromScenes(tourId);
      queuePersistTourScenes(tourId);
    } else {
      updateMemTour(tourId, {
        generationStatus: "failed",
        currentStage: "failed",
        errorMessage: "Generation timed out after 30 minutes",
      });
      await safeDbUpdate(
        tourId,
        {
          generationStatus: "failed",
          status: "failed",
          errorMessage: "Generation timed out after 30 minutes",
          processingCompletedAt: new Date(),
          currentStage: "failed",
        },
        "timeout",
      );
    }
    return;
  }

  // For per-scene polling we rely entirely on the in-memory mirror; the
  // tours table only tracks the parent tour's rolled-up state.
  let dbStatus: string | null = null;
  let dbRetries = 0;
  let dbThumb: string | null = null;
  if (!sceneId) {
    try {
      const tour = await db.query.toursTable.findFirst({
        where: eq(toursTable.id, tourId),
      });
      if (tour) {
        dbStatus = tour.generationStatus ?? null;
        dbRetries = tour.generationRetries ?? 0;
        dbThumb = tour.thumbnailUrl ?? null;
      }
    } catch (err) {
      logger.warn({ err, tourId }, "DB lookup during poll failed — using memory store");
    }
  }

  // Stop polling when we already have a terminal status for THIS unit
  // (scene or tour).
  const currentMemStatus = sceneId
    ? memTour?.scenes.find((s) => s.id === sceneId)?.generationStatus
    : memTour?.generationStatus;
  const effectiveStatus = dbStatus ?? currentMemStatus ?? "queued";
  if (effectiveStatus === "completed" || effectiveStatus === "failed") {
    return;
  }

  try {
    const result = await getOperationStatus(operationId);

    if (result.generationStatus === "completed") {
      const readyStage = isDryRunOperationId(operationId)
        ? "Ready (Marble off — WORLD_LABS_ENABLED=false; no credits used)"
        : "ready";

      const dryRun = isDryRunOperationId(operationId);
      let hostedSplatUrl: string | null = null;

      if (!dryRun) {
        if (!result.splatSourceUrl) {
          const msg =
            "Generation finished but no SPZ export URL was returned by the provider.";
          if (sceneId) {
            updateMemScene(tourId, sceneId, {
              generationStatus: "failed",
              errorMessage: msg,
            });
            rollupMemTourFromScenes(tourId);
            queuePersistTourScenes(tourId);
          } else {
            updateMemTour(tourId, {
              generationStatus: "failed",
              currentStage: "failed",
              errorMessage: msg,
            });
            await safeDbUpdate(
              tourId,
              {
                generationStatus: "failed",
                status: "failed",
                errorMessage: msg,
                processingCompletedAt: new Date(),
                currentStage: "failed",
              },
              "completion-no-spz",
            );
          }
          logger.warn({ tourId, sceneId, operationId }, msg);
          return;
        }
        if (!isSplatStorageConfigured()) {
          const msg =
            "Supabase Storage is not configured for .spz uploads — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and ensure a public Storage bucket named \"tours\" exists (see server boot logs).";
          if (sceneId) {
            updateMemScene(tourId, sceneId, {
              generationStatus: "failed",
              errorMessage: msg,
            });
            rollupMemTourFromScenes(tourId);
            queuePersistTourScenes(tourId);
          } else {
            updateMemTour(tourId, {
              generationStatus: "failed",
              currentStage: "failed",
              errorMessage: msg,
            });
            await safeDbUpdate(
              tourId,
              {
                generationStatus: "failed",
                status: "failed",
                errorMessage: msg,
                processingCompletedAt: new Date(),
                currentStage: "failed",
              },
              "completion-no-splat-storage",
            );
          }
          logger.error({ tourId, sceneId }, msg);
          return;
        }
        try {
          hostedSplatUrl = await mirrorSpzToSupabase({
            tourId,
            roomKey: sceneId ?? "tour",
            sourceUrl: result.splatSourceUrl,
          });
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Failed to mirror SPZ to Supabase Storage.";
          logger.error({ err, tourId, sceneId }, "SPZ mirror failed");
          if (sceneId) {
            updateMemScene(tourId, sceneId, {
              generationStatus: "failed",
              errorMessage: msg,
            });
            rollupMemTourFromScenes(tourId);
            queuePersistTourScenes(tourId);
          } else {
            updateMemTour(tourId, {
              generationStatus: "failed",
              currentStage: "failed",
              errorMessage: msg,
            });
            await safeDbUpdate(
              tourId,
              {
                generationStatus: "failed",
                status: "failed",
                errorMessage: msg,
                processingCompletedAt: new Date(),
                currentStage: "failed",
              },
              "completion-spz-mirror-failed",
            );
          }
          return;
        }
      }

      if (sceneId) {
        const sceneMeta = memTour?.scenes.find((s) => s.id === sceneId);
        updateMemScene(tourId, sceneId, {
          generationStatus: "completed",
          worldId: result.worldId,
          generatedTourUrl: hostedSplatUrl,
        });
        rollupMemTourFromScenes(tourId);
        queuePersistTourScenes(tourId);
        if (hostedSplatUrl && sceneMeta?.label) {
          void saveTourPhotoWorldEmbed(tourId, sceneMeta.label, hostedSplatUrl);
        }
      } else {
        updateMemTour(tourId, {
          generationStatus: "completed",
          currentStage: readyStage,
          worldId: result.worldId,
          generatedTourUrl: hostedSplatUrl,
          previewImageUrl: result.previewImageUrl,
        });
        await safeDbUpdate(
          tourId,
          {
            generationStatus: "completed",
            status: "ready",
            worldlabsJobId: result.worldId ?? operationId,
            generatedTourUrl: hostedSplatUrl,
            previewImageUrl: result.previewImageUrl,
            thumbnailUrl: result.previewImageUrl ?? dbThumb ?? undefined,
            tourEmbedUrl: hostedSplatUrl,
            processingCompletedAt: new Date(),
            currentStage: readyStage,
          },
          "completion",
        );
      }
      logger.info(
        {
          tourId,
          sceneId,
          operationId,
          worldId: result.worldId,
          hostedSplatUrl: hostedSplatUrl ?? "(dry-run)",
        },
        "Tour generation completed",
      );
      return;
    }

    if (result.generationStatus === "failed") {
      if (sceneId) {
        updateMemScene(tourId, sceneId, {
          generationStatus: "failed",
          errorMessage: result.error ?? "3D world generation failed",
        });
        rollupMemTourFromScenes(tourId);
        queuePersistTourScenes(tourId);
      } else {
        updateMemTour(tourId, {
          generationStatus: "failed",
          currentStage: "failed",
          errorMessage: result.error ?? "3D world generation failed",
        });
        await safeDbUpdate(
          tourId,
          {
            generationStatus: "failed",
            status: "failed",
            errorMessage: result.error ?? "3D world generation failed",
            processingCompletedAt: new Date(),
            currentStage: "failed",
          },
          "failure",
        );
      }
      logger.warn(
        { tourId, sceneId, operationId, error: result.error },
        "Tour generation failed",
      );
      return;
    }

    // Still queued or processing — push the latest stage label through.
    const stageMap: Record<string, string> = {
      queued: "Queued for generation…",
      processing: "Building your 3D world…",
    };
    const stage = stageMap[result.generationStatus] ?? "Processing…";

    if (sceneId) {
      updateMemScene(tourId, sceneId, {
        generationStatus: result.generationStatus,
        worldId: result.worldId ?? null,
      });
      rollupMemTourFromScenes(tourId);
      queuePersistTourScenes(tourId);
    } else {
      updateMemTour(tourId, {
        generationStatus: result.generationStatus,
        currentStage: stage,
        worldId: result.worldId ?? memTour?.worldId ?? null,
      });
      await safeDbUpdate(
        tourId,
        {
          generationStatus: result.generationStatus,
          currentStage: stage,
        },
        "progress",
      );
    }

    if (!process.env.VERCEL) {
      doSchedule(pollKey, operationId, startedAt);
    }
  } catch (err) {
    logger.error({ err, tourId, sceneId, operationId }, "WorldLabs poll request failed");

    const retries = Math.max(dbRetries, memTour ? 0 : 0) + 1;
    if (retries >= MAX_RETRIES) {
      if (sceneId) {
        updateMemScene(tourId, sceneId, {
          generationStatus: "failed",
          errorMessage: "Failed to check generation status after multiple retries",
        });
        rollupMemTourFromScenes(tourId);
        queuePersistTourScenes(tourId);
        return;
      }
      updateMemTour(tourId, {
        generationStatus: "failed",
        currentStage: "failed",
        errorMessage: "Failed to check generation status after multiple retries",
      });
      await safeDbUpdate(
        tourId,
        {
          generationStatus: "failed",
          status: "failed",
          errorMessage:
            "Failed to check generation status after multiple retries",
          generationRetries: retries,
          processingCompletedAt: new Date(),
        },
        "retries-exhausted",
      );
      return;
    }

    if (!sceneId) {
      await safeDbUpdate(
        tourId,
        { generationRetries: retries },
        "retry-bump",
      );
    }

    if (!process.env.VERCEL) {
      doSchedule(pollKey, operationId, startedAt);
    }
  }
}

export function cancelPoll(tourId: string) {
  const handle = activePollTimers.get(tourId);
  if (handle) {
    clearTimeout(handle);
    activePollTimers.delete(tourId);
  }
}
