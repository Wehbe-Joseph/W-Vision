import { db } from "@workspace/db";
import { toursTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const WORLDLABS_API_BASE = "https://api.worldlabs.ai";
const WORLDLABS_API_KEY = process.env.WORLD_LABS_API_KEY ?? "";
const POLL_INTERVAL_MS = 15_000;
const MAX_RETRIES = 3;
const MAX_POLL_DURATION_MS = 30 * 60 * 1000; // 30 min timeout

type WorldStatus =
  | "INITIALIZING"
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED";

interface WorldLabsWorld {
  id: string;
  status: WorldStatus;
  generation_output?: {
    cubemap_url?: string;
    hq_mesh_url?: string;
    thumbnail_url?: string;
    minimap_url?: string;
  };
  embed_url?: string;
  preview_url?: string;
  thumbnail_url?: string;
  error?: string;
}

interface CreateWorldResult {
  worldId: string;
}

interface WorldStatusResult {
  generationStatus: "queued" | "processing" | "completed" | "failed";
  worldlabsStatus: WorldStatus;
  tourUrl: string | null;
  previewImageUrl: string | null;
  error: string | null;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${WORLDLABS_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function mapStatus(wlStatus: WorldStatus): WorldStatusResult["generationStatus"] {
  switch (wlStatus) {
    case "INITIALIZING":
    case "PENDING":
      return "queued";
    case "RUNNING":
      return "processing";
    case "SUCCEEDED":
      return "completed";
    case "FAILED":
      return "failed";
    default:
      return "processing";
  }
}

export async function createWorld(imageUrls: string[]): Promise<CreateWorldResult> {
  if (!WORLDLABS_API_KEY) {
    throw new Error("WORLDLABSMARBLE_API_KEY is not configured");
  }

  const primaryImage = imageUrls[0];
  if (!primaryImage) {
    throw new Error("At least one image URL is required");
  }

  // Build the body — multi-image uses multi_image_prompt format from the Marble frontend
  const body =
    imageUrls.length === 1
      ? {
          generation_input: {
            prompt: {
              type: "image",
              image_prompt: { uri: primaryImage },
            },
          },
          model: "marble-1.1",
          visibility: "private",
          layout: "auto",
        }
      : {
          generation_input: {
            prompt: {
              type: "multi_image",
              multi_image_prompt: imageUrls.slice(0, 8).map((url) => ({
                uri: url,
                azimuth: null,
              })),
            },
            reconstruction: true,
          },
          model: "marble-1.1",
          visibility: "private",
          layout: "auto",
        };

  const res = await fetch(`${WORLDLABS_API_BASE}/api/v1/worlds`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `WorldLabs API error ${res.status}: ${errBody || res.statusText}`
    );
  }

  const data = (await res.json()) as { id?: string; world_id?: string };
  const worldId = data.id ?? data.world_id;
  if (!worldId) {
    throw new Error("WorldLabs API did not return a world ID");
  }

  return { worldId };
}

export async function getWorldStatus(worldId: string): Promise<WorldStatusResult> {
  const res = await fetch(
    `${WORLDLABS_API_BASE}/api/v1/worlds/${encodeURIComponent(worldId)}`,
    { headers: authHeaders() }
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `WorldLabs status check error ${res.status}: ${errBody || res.statusText}`
    );
  }

  const world = (await res.json()) as WorldLabsWorld;
  const generationStatus = mapStatus(world.status);

  const tourUrl =
    world.embed_url ??
    world.generation_output?.cubemap_url ??
    null;

  const previewImageUrl =
    world.thumbnail_url ??
    world.generation_output?.thumbnail_url ??
    world.generation_output?.minimap_url ??
    null;

  return {
    generationStatus,
    worldlabsStatus: world.status,
    tourUrl,
    previewImageUrl,
    error: world.error ?? null,
  };
}

// ─── Background Polling ───────────────────────────────────────────────────────

const activePollTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function schedulePoll(tourId: string, worldId: string, startedAt: Date) {
  if (activePollTimers.has(tourId)) return;
  doSchedule(tourId, worldId, startedAt);
}

function doSchedule(tourId: string, worldId: string, startedAt: Date) {
  const handle = setTimeout(() => {
    activePollTimers.delete(tourId);
    pollTour(tourId, worldId, startedAt).catch((err) => {
      logger.error({ err, tourId }, "Poll error");
    });
  }, POLL_INTERVAL_MS);
  activePollTimers.set(tourId, handle);
}

async function pollTour(
  tourId: string,
  worldId: string,
  startedAt: Date
): Promise<void> {
  const elapsed = Date.now() - startedAt.getTime();
  if (elapsed > MAX_POLL_DURATION_MS) {
    logger.warn({ tourId }, "Tour generation timed out");
    await db
      .update(toursTable)
      .set({
        generationStatus: "failed",
        status: "failed",
        errorMessage: "Generation timed out after 30 minutes",
        processingCompletedAt: new Date(),
      })
      .where(eq(toursTable.id, tourId));
    return;
  }

  const tour = await db.query.toursTable.findFirst({
    where: eq(toursTable.id, tourId),
  });
  if (!tour || tour.generationStatus === "completed" || tour.generationStatus === "failed") {
    return;
  }

  try {
    const result = await getWorldStatus(worldId);

    if (result.generationStatus === "completed") {
      await db
        .update(toursTable)
        .set({
          generationStatus: "completed",
          status: "ready",
          worldlabsJobId: worldId,
          generatedTourUrl: result.tourUrl,
          previewImageUrl: result.previewImageUrl,
          thumbnailUrl: result.previewImageUrl ?? tour.thumbnailUrl,
          tourEmbedUrl: result.tourUrl,
          processingCompletedAt: new Date(),
          currentStage: "ready",
        })
        .where(eq(toursTable.id, tourId));
      logger.info({ tourId, worldId }, "Tour generation completed");
      return;
    }

    if (result.generationStatus === "failed") {
      await db
        .update(toursTable)
        .set({
          generationStatus: "failed",
          status: "failed",
          errorMessage: result.error ?? "3D world generation failed",
          processingCompletedAt: new Date(),
          currentStage: "failed",
        })
        .where(eq(toursTable.id, tourId));
      logger.warn({ tourId, worldId, error: result.error }, "Tour generation failed");
      return;
    }

    const stageMap: Record<string, string> = {
      queued: "Queued for generation…",
      processing: "Building your 3D world…",
    };

    await db
      .update(toursTable)
      .set({
        generationStatus: result.generationStatus,
        currentStage: stageMap[result.generationStatus] ?? "Processing…",
      })
      .where(eq(toursTable.id, tourId));

    doSchedule(tourId, worldId, startedAt);
  } catch (err) {
    logger.error({ err, tourId, worldId }, "WorldLabs poll request failed");

    const retries = (tour.generationRetries ?? 0) + 1;
    if (retries >= MAX_RETRIES) {
      await db
        .update(toursTable)
        .set({
          generationStatus: "failed",
          status: "failed",
          errorMessage: "Failed to check generation status after multiple retries",
          generationRetries: retries,
          processingCompletedAt: new Date(),
        })
        .where(eq(toursTable.id, tourId));
      return;
    }

    await db
      .update(toursTable)
      .set({ generationRetries: retries })
      .where(eq(toursTable.id, tourId));

    doSchedule(tourId, worldId, startedAt);
  }
}

export function cancelPoll(tourId: string) {
  const handle = activePollTimers.get(tourId);
  if (handle) {
    clearTimeout(handle);
    activePollTimers.delete(tourId);
  }
}
