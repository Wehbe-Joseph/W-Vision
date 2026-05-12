import { randomBytes } from "crypto";
import { requireSupabaseAdmin, supabaseAdmin } from "./supabaseAdmin";
import { storeImage, getPublicBaseUrl } from "./imageStore";
import { logger } from "./logger";
import type { Request } from "express";

export const TOUR_IMAGES_BUCKET = "tour-images";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function extFromMime(mimeType: string): string {
  return EXT_BY_MIME[mimeType.toLowerCase()] ?? "bin";
}

/** True when Supabase Storage is configured and reachable. */
function storageAvailable(): boolean {
  return supabaseAdmin !== null;
}

/**
 * Ensure the public bucket exists. Idempotent — swallows "already exists".
 * Errors are only warned so the server keeps booting.
 */
export async function ensureTourImagesBucket(): Promise<void> {
  if (!supabaseAdmin) {
    logger.warn(
      "Skipping ensureTourImagesBucket — supabaseAdmin not configured.",
    );
    return;
  }

  const { data } = await supabaseAdmin.storage.getBucket(TOUR_IMAGES_BUCKET);
  if (data) {
    if (!data.public) {
      logger.warn(
        { bucket: TOUR_IMAGES_BUCKET },
        "tour-images bucket is private — WorldLabs cannot fetch images. Make it public in the Supabase dashboard.",
      );
    }
    return;
  }

  const { error: createErr } = await supabaseAdmin.storage.createBucket(
    TOUR_IMAGES_BUCKET,
    {
      public: true,
      fileSizeLimit: "25MB",
      allowedMimeTypes: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/avif",
      ],
    },
  );

  if (createErr && !/already.?exists/i.test(createErr.message)) {
    logger.error(
      { err: createErr },
      "Failed to create tour-images Supabase Storage bucket",
    );
    // Don't throw — server continues; uploads will use in-memory fallback.
    return;
  }

  logger.info({ bucket: TOUR_IMAGES_BUCKET }, "Created public Supabase Storage bucket");
}

interface UploadResult {
  key: string;
  publicUrl: string;
  /** True when the image was stored in the in-process memory store as a
   *  fallback because Supabase Storage was unavailable. WorldLabs cannot
   *  fetch these URLs unless the api-server is publicly accessible. */
  isLocal: boolean;
}

/**
 * Upload a buffer. Tries Supabase Storage first; if Storage isn't configured
 * or the bucket doesn't exist yet, falls back to the in-memory store so the
 * upload endpoint never returns 500 for a missing bucket.
 *
 * The `req` parameter is needed for the local fallback URL only.
 */
export async function uploadTourImage(
  data: Buffer,
  mimeType: string,
  ownerId: string,
  req?: Request,
): Promise<UploadResult> {
  if (storageAvailable()) {
    const admin = requireSupabaseAdmin();
    const ext = extFromMime(mimeType);
    const key = `${ownerId}/${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;

    // First attempt
    let uploadError = await admin.storage
      .from(TOUR_IMAGES_BUCKET)
      .upload(key, data, { contentType: mimeType, cacheControl: "3600", upsert: false })
      .then((r) => r.error);

    // If the bucket was missing, create it and retry once.
    if (
      uploadError &&
      /not.?found|no such bucket|bucket.*not.*exist/i.test(uploadError.message)
    ) {
      logger.warn({ bucket: TOUR_IMAGES_BUCKET }, "Bucket missing on upload — creating now");
      const { error: createErr } = await admin.storage.createBucket(
        TOUR_IMAGES_BUCKET,
        { public: true, fileSizeLimit: "25MB" },
      );
      if (createErr && !/already.?exists/i.test(createErr.message)) {
        logger.error({ err: createErr }, "Could not auto-create bucket");
      } else {
        // Retry with a fresh key to avoid a collision
        const retryKey = `${ownerId}/${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
        const retry = await admin.storage
          .from(TOUR_IMAGES_BUCKET)
          .upload(retryKey, data, { contentType: mimeType, cacheControl: "3600", upsert: false });
        if (!retry.error) {
          const { data: pu } = admin.storage
            .from(TOUR_IMAGES_BUCKET)
            .getPublicUrl(retryKey);
          return { key: retryKey, publicUrl: pu.publicUrl, isLocal: false };
        }
        uploadError = retry.error;
      }
    }

    if (!uploadError) {
      const { data: pu } = admin.storage
        .from(TOUR_IMAGES_BUCKET)
        .getPublicUrl(key);
      return { key, publicUrl: pu.publicUrl, isLocal: false };
    }

    // Storage call failed for another reason — log and fall through to local.
    logger.warn(
      { err: uploadError, key },
      "Supabase Storage upload failed — falling back to in-memory store",
    );
  }

  // ── In-memory fallback ────────────────────────────────────────────────────
  const id = storeImage(data, mimeType);
  const baseUrl = req
    ? getPublicBaseUrl(req as Parameters<typeof getPublicBaseUrl>[0])
    : (process.env.PUBLIC_API_BASE_URL ?? "http://localhost:8080");
  return { key: id, publicUrl: `${baseUrl}/api/images/${id}`, isLocal: true };
}

/**
 * Decode a `data:image/...;base64,...` data URL, upload it, and return the
 * public URL. Returns null if the data URL is malformed.
 */
export async function uploadDataUrlToStorage(
  dataUrl: string,
  ownerId: string,
  req?: Request,
): Promise<string | null> {
  try {
    const [meta, b64] = dataUrl.split(",");
    if (!b64) return null;
    const mimeType = meta.split(";")[0].replace("data:", "") || "image/jpeg";
    const buffer = Buffer.from(b64, "base64");
    const { publicUrl } = await uploadTourImage(buffer, mimeType, ownerId, req);
    return publicUrl;
  } catch (err) {
    logger.warn({ err }, "uploadDataUrlToStorage failed — skipping image");
    return null;
  }
}
