import { db } from "@workspace/db";
import { toursTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getMemTour, updateMemTour } from "./tourMemoryStore";

// ─── Config ───────────────────────────────────────────────────────────────────
//
// World Labs / Marble API. The current public API lives under
// `/marble/v1` and uses a `WLT-Api-Key` header for auth. See
// https://docs.worldlabs.ai/api for the latest reference.

const WORLDLABS_API_BASE = "https://api.worldlabs.ai";
const WORLDLABS_API_KEY = process.env.WORLD_LABS_API_KEY ?? "";
const MARBLE_MODEL = process.env.WORLD_LABS_MODEL ?? "marble-1.1";

const POLL_INTERVAL_MS = 15_000;
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
  world_marble_url: string;
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

export interface CreateWorldResult {
  /** Long-running operation id returned by `worlds:generate`. */
  operationId: string;
}

interface WorldStatusResult {
  generationStatus: "queued" | "processing" | "completed" | "failed";
  worldlabsStatus: ProgressStatus | "UNKNOWN";
  /** The generated world id (only populated once Marble starts producing one). */
  worldId: string | null;
  /** Public marble.worldlabs.ai URL we can embed in an iframe. */
  tourUrl: string | null;
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

function marbleEmbedUrl(worldId: string | null | undefined): string | null {
  if (!worldId) return null;
  return `https://marble.worldlabs.ai/world/${worldId}`;
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
  if (!WORLDLABS_API_KEY) {
    throw new Error("WORLD_LABS_API_KEY is not configured");
  }

  // Marble caps multi-image prompts; trim defensively.
  const usable = imageUrls.filter((u) => !!u && u.startsWith("https://")).slice(0, 8);
  if (usable.length === 0) {
    throw new Error("At least one public https:// image URL is required");
  }

  let worldPrompt: Record<string, unknown>;
  if (usable.length === 1) {
    worldPrompt = {
      type: "image",
      image_prompt: { source: "uri", uri: usable[0] },
    };
  } else {
    // Spread azimuths roughly evenly around the circle so Marble has
    // some directional hint when reconstructing the room. The user can
    // refine these later in the Marble UI.
    const step = 360 / usable.length;
    worldPrompt = {
      type: "multi-image",
      multi_image_prompt: usable.map((uri, i) => ({
        azimuth: Math.round(i * step),
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

  let generationStatus: WorldStatusResult["generationStatus"];
  if (op.done && op.error) {
    generationStatus = "failed";
  } else if (op.done && op.response) {
    generationStatus = "completed";
  } else {
    generationStatus = mapProgress(progress);
  }

  const tourUrl =
    op.response?.world_marble_url ?? marbleEmbedUrl(worldId);

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
    tourUrl,
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
  if (activePollTimers.has(tourId)) return;
  doSchedule(tourId, operationId, startedAt);
}

function doSchedule(tourId: string, operationId: string, startedAt: Date) {
  const handle = setTimeout(() => {
    activePollTimers.delete(tourId);
    pollTour(tourId, operationId, startedAt).catch((err) => {
      logger.error({ err, tourId }, "Poll error");
    });
  }, POLL_INTERVAL_MS);
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
  tourId: string,
  operationId: string,
  startedAt: Date,
): Promise<void> {
  const elapsed = Date.now() - startedAt.getTime();
  const memTour = getMemTour(tourId);

  if (elapsed > MAX_POLL_DURATION_MS) {
    logger.warn({ tourId }, "Tour generation timed out");
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
    return;
  }

  // Check whether we should stop polling — the source of truth is whichever
  // store currently shows a terminal state.
  let dbStatus: string | null = null;
  let dbRetries = 0;
  let dbThumb: string | null = null;
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

  const effectiveStatus = dbStatus ?? memTour?.generationStatus ?? "queued";
  if (effectiveStatus === "completed" || effectiveStatus === "failed") {
    return;
  }

  try {
    const result = await getOperationStatus(operationId);

    if (result.generationStatus === "completed") {
      updateMemTour(tourId, {
        generationStatus: "completed",
        currentStage: "ready",
        worldId: result.worldId,
        generatedTourUrl: result.tourUrl,
        previewImageUrl: result.previewImageUrl,
      });
      await safeDbUpdate(
        tourId,
        {
          generationStatus: "completed",
          status: "ready",
          worldlabsJobId: result.worldId ?? operationId,
          generatedTourUrl: result.tourUrl,
          previewImageUrl: result.previewImageUrl,
          thumbnailUrl: result.previewImageUrl ?? dbThumb ?? undefined,
          tourEmbedUrl: result.tourUrl,
          processingCompletedAt: new Date(),
          currentStage: "ready",
        },
        "completion",
      );
      logger.info(
        { tourId, operationId, worldId: result.worldId, tourUrl: result.tourUrl },
        "Tour generation completed",
      );
      return;
    }

    if (result.generationStatus === "failed") {
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
      logger.warn(
        { tourId, operationId, error: result.error },
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

    doSchedule(tourId, operationId, startedAt);
  } catch (err) {
    logger.error({ err, tourId, operationId }, "WorldLabs poll request failed");

    const retries = Math.max(dbRetries, memTour ? 0 : 0) + 1;
    if (retries >= MAX_RETRIES) {
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

    await safeDbUpdate(
      tourId,
      { generationRetries: retries },
      "retry-bump",
    );

    doSchedule(tourId, operationId, startedAt);
  }
}

export function cancelPoll(tourId: string) {
  const handle = activePollTimers.get(tourId);
  if (handle) {
    clearTimeout(handle);
    activePollTimers.delete(tourId);
  }
}
