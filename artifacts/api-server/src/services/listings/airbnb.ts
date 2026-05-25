import AdmZip from "adm-zip";
import { randomBytes } from "node:crypto";
import {
  runApifyActor,
  fetchKeyValueRecord,
  listKeyValueStoreKeys,
} from "./apify";
import { uploadTourImage } from "../../lib/imageStorage";
import { normalizeToJpeg } from "../../lib/imageNormalize";
import { logger } from "../../lib/logger";
import { filterListingImageUrls, isJunkListingImageUrl } from "../../lib/listingImageFilter";
import {
  type ListingData,
  type ListingImage,
  type ListingMetadata,
  ListingScrapeError,
} from "./types";

/**
 * Airbnb scraping strategy
 *
 * 1. **Primary:** fetch the listing page directly and parse image URLs out of
 *    the HTML (CDN host `a0.muscache.com/im/pictures/...`) and the embedded
 *    `__NEXT_DATA__` / JSON-LD blocks. This is free, instant, and survives
 *    actor outages.
 * 2. **Fallback (optional):** call an Apify actor when the direct fetch
 *    yields no images. Configure with `APIFY_AIRBNB_ACTOR_ID`. The actor's
 *    dataset items are normalized — different actors return different
 *    schemas, so we cherry-pick whatever fields exist.
 *
 * Set `APIFY_AIRBNB_ACTOR_ID=` (empty) to disable the fallback entirely.
 */

const AIRBNB_HOST_RE = /(^|\.)airbnb\.[a-z.]+$/i;
const MUSCACHE_URL_RE =
  /https:\/\/a0\.muscache\.com\/im\/pictures\/[A-Za-z0-9\/\-_.]+?\.(?:jpe?g|png|webp|avif)/g;
const MUSCACHE_GENERIC_RE =
  /https:\/\/a0\.muscache\.com\/im\/[A-Za-z0-9\/\-_.]+\.(?:jpe?g|png|webp|avif)/g;

// Use a recent desktop Chrome UA so Airbnb returns the standard HTML page
// (their bot detection redirects "unknown" UAs to a stripped-down shell).
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function isAirbnbUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return AIRBNB_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

export async function getAirbnbListingData(url: string): Promise<ListingData> {
  if (!isAirbnbUrl(url)) {
    throw new ListingScrapeError(
      "INVALID_URL",
      "URL is not an Airbnb listing URL",
      400,
    );
  }

  const startedAt = Date.now();

  // ── 1. Direct HTML fetch (primary path) ─────────────────────────────────
  let result = await tryDirectScrape(url, startedAt);

  // ── 2. Apify fallback (optional) ─────────────────────────────────────────
  if (result.images.length === 0 && process.env.APIFY_AIRBNB_ACTOR_ID) {
    logger.info(
      { url, actorId: process.env.APIFY_AIRBNB_ACTOR_ID },
      "Direct scrape found no images — trying Apify fallback",
    );
    try {
      const fromActor = await tryApifyScrape(url, startedAt);
      if (fromActor.images.length > 0) {
        result = fromActor;
      }
    } catch (err) {
      logger.warn({ err }, "Apify fallback failed");
    }
  }

  if (result.images.length === 0) {
    throw new ListingScrapeError(
      "NO_RESULTS",
      "Couldn't extract any images from this Airbnb listing — it may be private, removed, or behind a login.",
      404,
    );
  }

  return result;
}

// ─── 1. Direct scrape ─────────────────────────────────────────────────────────

async function tryDirectScrape(
  url: string,
  startedAt: number,
): Promise<ListingData> {
  let html = "";
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      logger.warn(
        { url, status: res.status },
        "Direct Airbnb fetch returned non-2xx",
      );
      return emptyListing(url, startedAt);
    }
    html = await res.text();
  } catch (err) {
    logger.warn({ err, url }, "Direct Airbnb fetch failed");
    return emptyListing(url, startedAt);
  }

  // Pull out image URLs found anywhere in the HTML (covers og:image, JSON-LD,
  // __NEXT_DATA__ embeds, etc — Airbnb serves all listing photos via the
  // muscache.com CDN).
  const matches = new Set<string>();
  for (const m of html.matchAll(MUSCACHE_URL_RE)) matches.add(m[0]);
  if (matches.size === 0) {
    for (const m of html.matchAll(MUSCACHE_GENERIC_RE)) matches.add(m[0]);
  }

  // Filter out small icons / branding assets — listing photos are always
  // served from /im/pictures/ and tend to use the longer, hashed paths.
  const urls = filterListingImageUrls(
    Array.from(matches).filter(
      (u) =>
        u.includes("/im/pictures/") &&
        !/\b(?:logo|emblem|icon|avatar|host_thumbnail)\b/i.test(u),
    ),
  );
  const images: ListingImage[] = urls.map((url) => ({
    url,
    caption: null,
    room: null,
  }));

  return {
    platform: "airbnb",
    url,
    title: extractTitle(html),
    description: extractMeta(html, "description"),
    images,
    rooms: [],
    metadata: extractMetadata(html),
    scrapedAtMs: startedAt,
    durationMs: Date.now() - startedAt,
  };
}

function extractTitle(html: string): string | null {
  // Prefer og:title (the listing's actual name) over the <title> tag, which
  // often includes "- Airbnb" branding.
  return (
    extractMeta(html, "og:title", "property") ??
    matchFirst(html, /<title[^>]*>([^<]+)<\/title>/i) ??
    null
  );
}

function extractMeta(
  html: string,
  name: string,
  attr: "name" | "property" = "name",
): string | null {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${escapeRegex(name)}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  return matchFirst(html, re);
}

function extractMetadata(html: string): ListingMetadata {
  // Best-effort scrape of common patterns; Airbnb's structure is JSON-heavy
  // and varies by region/locale, so we don't try to be exhaustive here.
  const bedrooms = matchNumber(html, /(\d+)\s+bedrooms?/i);
  const bathrooms = matchNumber(html, /(\d+(?:\.\d+)?)\s+bathrooms?/i);
  const guests = matchNumber(html, /(\d+)\s+guests?/i);
  const beds = matchNumber(html, /(\d+)\s+beds?/i);

  return {
    bedrooms,
    bathrooms,
    guests,
    beds,
    propertyType: null,
    extras: {},
  };
}

function matchFirst(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m && m[1] ? decodeHtmlEntities(m[1]) : null;
}

function matchNumber(html: string, re: RegExp): number | null {
  const m = html.match(re);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function emptyListing(url: string, startedAt: number): ListingData {
  return {
    platform: "airbnb",
    url,
    title: null,
    description: null,
    images: [],
    rooms: [],
    metadata: { extras: {} },
    scrapedAtMs: startedAt,
    durationMs: Date.now() - startedAt,
  };
}

// ─── 2. Apify fallback ────────────────────────────────────────────────────────

async function tryApifyScrape(
  url: string,
  startedAt: number,
): Promise<ListingData> {
  const actorId =
    process.env.APIFY_AIRBNB_ACTOR_ID ?? "parseforge/airbnb-scraper";

  // Send the URL under every common alias so this works across actor schemas
  // — Apify silently ignores unknown input fields.
  const { items, durationMs, defaultKeyValueStoreId } =
    await runApifyActor<RawAirbnbItem>({
      actorId,
      input: {
        url,
        startUrl: url,
        airbnbUrl: url,
        listingUrl: url,
        urls: [url],
        startUrls: [{ url }],
        maxItems: 1,
        maxListings: 1,
        proxyConfiguration: { useApifyProxy: true },
      },
      timeoutSecs: 180,
      maxItems: 500,
    });

  // First try to parse image URLs from the dataset items (most scrapers).
  const primary = items.length
    ? (items.find((it) => typeof it.url === "string" && it.url === url) ??
      items[0])
    : null;
  const datasetImages = primary ? extractImagesFromActor(primary) : [];

  // Image-downloader actors (e.g. rigelbytes/airbnb-images-downloader) don't
  // return URLs in their dataset — they bundle the photos into a zip in the
  // key-value store. Try the zip path whenever the dataset yielded no images.
  if (datasetImages.length === 0 && defaultKeyValueStoreId) {
    const fromZip = await tryUnzipKeyValueStore(
      defaultKeyValueStoreId,
      url,
      startedAt,
    );
    if (fromZip) return fromZip;
  }

  if (!primary) return emptyListing(url, startedAt);

  const images = datasetImages;
  const rooms = Array.from(
    new Set(
      images
        .map((img) => img.room)
        .filter((r): r is string => typeof r === "string" && r.length > 0),
    ),
  );

  return {
    platform: "airbnb",
    url,
    title: stringOrNull(primary.title ?? primary.name ?? primary.heading),
    description: stringOrNull(primary.description ?? primary.summary),
    images,
    rooms,
    metadata: {
      bedrooms: toNumber(primary.bedrooms ?? primary.numberOfBedrooms),
      bathrooms: toNumber(primary.bathrooms ?? primary.numberOfBathrooms),
      guests: toNumber(primary.personCapacity ?? primary.maxGuests),
      beds: toNumber(primary.beds ?? primary.numberOfBeds),
      propertyType: stringOrNull(primary.propertyType ?? primary.roomType),
      extras: {
        price: primary.price ?? primary.pricing ?? null,
        location: primary.location ?? primary.address ?? null,
        host: primary.host ?? primary.hostName ?? null,
        rating: primary.rating ?? primary.starRating ?? null,
      },
    },
    scrapedAtMs: startedAt,
    durationMs,
  };
}

interface RawAirbnbItem {
  url?: string;
  title?: string;
  name?: string;
  heading?: string;
  description?: string;
  summary?: string;
  bedrooms?: number | string;
  bathrooms?: number | string;
  beds?: number | string;
  numberOfBedrooms?: number | string;
  numberOfBathrooms?: number | string;
  numberOfBeds?: number | string;
  personCapacity?: number | string;
  maxGuests?: number | string;
  propertyType?: string;
  roomType?: string;
  price?: unknown;
  pricing?: unknown;
  location?: unknown;
  address?: unknown;
  host?: unknown;
  hostName?: unknown;
  rating?: unknown;
  starRating?: unknown;
  photos?: RawPhoto[];
  images?: RawPhoto[] | string[];
  pictures?: RawPhoto[];
  rooms?: RawRoom[];
}

interface RawPhoto {
  url?: string;
  pictureUrl?: string;
  large?: string;
  src?: string;
  caption?: string;
  accessibilityLabel?: string;
  room?: string;
  category?: string;
}

interface RawRoom {
  name?: string;
  label?: string;
  photos?: RawPhoto[];
  images?: RawPhoto[];
}

// ─── Zip-downloader path ──────────────────────────────────────────────────────

const IMAGE_EXT_RE = /\.(?:jpe?g|png|webp|avif|gif)$/i;
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
};
const ZIP_OWNER_ID = "listing-scrape";

/**
 * If the actor's KV store contains an `images.zip` (or similar), download it,
 * unzip in memory, and upload each photo to Supabase Storage. Returns a
 * normalized `ListingData` with public HTTPS image URLs.
 *
 * Returns null when no zip was found, so the caller can fall through.
 */
async function tryUnzipKeyValueStore(
  storeId: string,
  url: string,
  startedAt: number,
): Promise<ListingData | null> {
  const keys = await listKeyValueStoreKeys(storeId);
  const zipKey = keys.find((k) => /\.zip$/i.test(k));
  if (!zipKey) return null;

  logger.info(
    { storeId, zipKey },
    "Actor produced a zip — unpacking and uploading images",
  );

  let buf: Buffer;
  try {
    buf = await fetchKeyValueRecord(storeId, zipKey);
  } catch (err) {
    logger.warn({ err, storeId, zipKey }, "Failed to fetch zip from KV store");
    return null;
  }

  let entries: { name: string; data: Buffer }[];
  try {
    const zip = new AdmZip(buf);
    entries = zip
      .getEntries()
      .filter((e) => !e.isDirectory && IMAGE_EXT_RE.test(e.entryName))
      .map((e) => ({ name: e.entryName, data: e.getData() }));
  } catch (err) {
    logger.warn({ err }, "Failed to read zip archive");
    return null;
  }

  if (entries.length === 0) return null;

  // Upload each image. Concurrency is bounded — Supabase Storage has rate
  // limits and we don't want to flood it with hundreds of parallel calls.
  const uploaded = await uploadInBatches(entries, 4);
  if (uploaded.length === 0) return null;

  return {
    platform: "airbnb",
    url,
    title: null,
    description: null,
    images: uploaded,
    rooms: [],
    metadata: { extras: {} },
    scrapedAtMs: startedAt,
    durationMs: Date.now() - startedAt,
  };
}

async function uploadInBatches(
  entries: { name: string; data: Buffer }[],
  batchSize: number,
): Promise<ListingImage[]> {
  const ownerId = `${ZIP_OWNER_ID}-${randomBytes(4).toString("hex")}`;
  const results: ListingImage[] = [];

  for (let i = 0; i < entries.length; i += batchSize) {
    const slice = entries.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      slice.map(async (entry) => {
        const jpeg = await normalizeToJpeg(entry.data);
        const { publicUrl } = await uploadTourImage(jpeg, "image/jpeg", ownerId);
        return { url: publicUrl, caption: null, room: null };
      }),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
      else logger.warn({ err: r.reason }, "Image upload failed — skipping");
    }
  }
  return results;
}

// ─── Generic dataset extractor ────────────────────────────────────────────────

function extractImagesFromActor(item: RawAirbnbItem): ListingImage[] {
  const out: ListingImage[] = [];

  const flat: RawPhoto[] = [
    ...(item.photos ?? []),
    ...((item.pictures ?? []) as RawPhoto[]),
    ...((Array.isArray(item.images) ? item.images : []) as (RawPhoto | string)[])
      .map((p) => (typeof p === "string" ? { url: p } : p))
      .filter(Boolean) as RawPhoto[],
  ];
  for (const p of flat) out.push(toListingImage(p));

  for (const room of item.rooms ?? []) {
    const roomName = stringOrNull(room.name ?? room.label) ?? null;
    const photos = [...(room.photos ?? []), ...(room.images ?? [])];
    for (const p of photos) {
      out.push(toListingImage({ ...p, room: p.room ?? roomName ?? undefined }));
    }
  }

  const seen = new Set<string>();
  const deduped = out
    .filter((img) => !!img.url && !isJunkListingImageUrl(img.url))
    .filter((img) => {
      const canonical = img.url.replace(/\?.*$/, "");
      if (seen.has(canonical)) return false;
      seen.add(canonical);
      img.url = canonical;
      return true;
    });
  const urls = filterListingImageUrls(deduped.map((i) => i.url));
  const byUrl = new Map(deduped.map((i) => [i.url.replace(/\?.*$/, ""), i]));
  return urls.map((url) => byUrl.get(url) ?? { url, caption: null, room: null });
}

function toListingImage(p: RawPhoto): ListingImage {
  const url = stringOrNull(p.url ?? p.pictureUrl ?? p.large ?? p.src) ?? "";
  return {
    url,
    caption: stringOrNull(p.caption ?? p.accessibilityLabel),
    room: stringOrNull(p.room ?? p.category),
  };
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
