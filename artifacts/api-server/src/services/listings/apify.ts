import { ApifyClient } from "apify-client";
import { logger } from "../../lib/logger";
import { ListingScrapeError } from "./types";

/**
 * Lazy singleton — instantiating ApifyClient throws when no token is set,
 * so we defer until the first actor call. Callers should catch
 * `ListingScrapeError("CONFIG_MISSING", ...)` and bubble it up as 503.
 */
let cached: ApifyClient | null = null;

export function getApifyClient(): ApifyClient {
  if (cached) return cached;

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new ListingScrapeError(
      "CONFIG_MISSING",
      "APIFY_TOKEN is not set in the api-server environment",
      503,
    );
  }
  cached = new ApifyClient({ token });
  return cached;
}

export interface RunApifyActorOpts {
  /** Actor ID in `username/actor-name` or `username~actor-name` form. */
  actorId: string;
  /** Input JSON passed to the actor. */
  input: unknown;
  /** Hard ceiling for the actor run (seconds). Defaults to 90s. */
  timeoutSecs?: number;
  /** Cap how many dataset items we pull back. */
  maxItems?: number;
}

export interface ApifyRunResult<T = unknown> {
  items: T[];
  durationMs: number;
  runId: string;
  status: string;
  /** Key-value store id for this run — useful when the actor stashes output
   *  there instead of (or in addition to) the dataset (e.g. zip downloaders). */
  defaultKeyValueStoreId: string | null;
}

/**
 * Run an Apify actor synchronously and return its dataset items + KV store id.
 */
export async function runApifyActor<T = unknown>(
  opts: RunApifyActorOpts,
): Promise<ApifyRunResult<T>> {
  const { actorId, input, timeoutSecs = 90, maxItems = 100 } = opts;
  const client = getApifyClient();

  const startedAt = Date.now();
  logger.info({ actorId, timeoutSecs }, "apify: starting actor run");

  let run;
  try {
    run = await client.actor(actorId).call(input, {
      timeout: timeoutSecs,
      memory: 2048,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/timed?\s*out/i.test(message)) {
      throw new ListingScrapeError(
        "ACTOR_TIMEOUT",
        `Apify actor ${actorId} timed out after ${timeoutSecs}s`,
        504,
      );
    }
    logger.error({ err, actorId }, "apify: actor call failed");
    throw new ListingScrapeError(
      "ACTOR_FAILED",
      `Apify actor ${actorId} failed: ${message}`,
      502,
    );
  }

  if (run.status !== "SUCCEEDED") {
    throw new ListingScrapeError(
      "ACTOR_FAILED",
      `Apify actor ${actorId} ended with status ${run.status}`,
      502,
    );
  }

  const { items } = await client
    .dataset(run.defaultDatasetId)
    .listItems({ limit: maxItems });

  const durationMs = Date.now() - startedAt;
  logger.info(
    {
      actorId,
      runId: run.id,
      durationMs,
      itemCount: items.length,
      kvStoreId: run.defaultKeyValueStoreId,
    },
    "apify: actor run completed",
  );

  return {
    items: items as T[],
    durationMs,
    runId: run.id,
    status: run.status,
    defaultKeyValueStoreId: run.defaultKeyValueStoreId ?? null,
  };
}

/**
 * Fetch a binary record from an Apify key-value store.
 *
 * Useful for actors that bundle their output (e.g. image-downloader actors
 * that produce `images.zip`). Throws ListingScrapeError on network failure.
 */
export async function fetchKeyValueRecord(
  storeId: string,
  recordKey: string,
): Promise<Buffer> {
  const token = process.env.APIFY_TOKEN ?? "";
  const url = `https://api.apify.com/v2/key-value-stores/${storeId}/records/${encodeURIComponent(recordKey)}?token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new ListingScrapeError(
      "ACTOR_FAILED",
      `Failed to fetch ${recordKey} from key-value store ${storeId}: HTTP ${res.status}`,
      502,
    );
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * List the keys present in an Apify key-value store. Used to detect actors
 * that emit binary output (e.g. `images.zip`) instead of dataset items.
 */
export async function listKeyValueStoreKeys(
  storeId: string,
): Promise<string[]> {
  const token = process.env.APIFY_TOKEN ?? "";
  const url = `https://api.apify.com/v2/key-value-stores/${storeId}/keys?token=${token}&limit=200`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { items?: { key: string }[] };
    };
    return (json.data?.items ?? []).map((i) => i.key);
  } catch {
    return [];
  }
}
