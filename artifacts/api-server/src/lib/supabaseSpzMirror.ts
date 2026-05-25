import { getSupabaseAdmin, requireSupabaseAdmin } from "./supabaseAdmin";
import { logger } from "./logger";

/** Public bucket for Gaussian splat (.spz) files — same name as logical prefix in paths. */
export const SPZ_STORAGE_BUCKET = "tours";

/**
 * True when server-side Supabase Storage uploads are available (service role).
 * SPZ mirroring requires the same credentials as other admin storage ops.
 */
export function isSplatStorageConfigured(): boolean {
  return getSupabaseAdmin() !== null;
}

/**
 * Ensure the public `tours` bucket exists for .spz objects. Idempotent.
 */
export async function ensureToursSpzBucket(): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    logger.warn(
      "Skipping ensureToursSpzBucket — supabaseAdmin not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).",
    );
    return;
  }

  const { data } = await supabaseAdmin.storage.getBucket(SPZ_STORAGE_BUCKET);
  if (data) {
    if (!data.public) {
      logger.warn(
        { bucket: SPZ_STORAGE_BUCKET },
        "tours bucket is private — make it public in Supabase so the Spark viewer can fetch .spz files.",
      );
    }
    return;
  }

  // Try with a generous per-file limit first; if the Supabase plan rejects it
  // (free tier caps at 50MB → returns 413 "exceeded the maximum allowed size"
  // on the createBucket call itself), retry without a limit so the bucket
  // still gets created and we just inherit the project default.
  let { error: createErr } = await supabaseAdmin.storage.createBucket(
    SPZ_STORAGE_BUCKET,
    {
      public: true,
      fileSizeLimit: "200MB",
    },
  );

  if (
    createErr &&
    /exceeded the maximum allowed size|maximum allowed size/i.test(
      createErr.message,
    )
  ) {
    const retry = await supabaseAdmin.storage.createBucket(
      SPZ_STORAGE_BUCKET,
      { public: true },
    );
    createErr = retry.error;
  }

  if (createErr && !/already.?exists/i.test(createErr.message)) {
    logger.error(
      { err: createErr },
      "Failed to create tours Supabase Storage bucket for .spz files",
    );
    return;
  }

  logger.info({ bucket: SPZ_STORAGE_BUCKET }, "Ensured public Supabase Storage bucket for splats");
}

/**
 * Download SPZ from World Labs (or any HTTPS URL) and upload to Supabase Storage.
 * Object path inside bucket: `tours/{tourId}/{roomKey}.spz`
 * Returns the Storage public URL.
 */
export async function mirrorSpzToSupabase(opts: {
  tourId: string;
  roomKey: string;
  sourceUrl: string;
}): Promise<string> {
  const admin = requireSupabaseAdmin();
  const safeKey = opts.roomKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const objectPath = `tours/${opts.tourId}/${safeKey}.spz`;

  const resp = await fetch(opts.sourceUrl, { redirect: "follow" });
  if (!resp.ok) {
    throw new Error(`SPZ download failed: HTTP ${resp.status}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.byteLength < 1024) {
    throw new Error(`SPZ download suspiciously small (${buf.byteLength} bytes)`);
  }

  const { error: uploadError } = await admin.storage
    .from(SPZ_STORAGE_BUCKET)
    .upload(objectPath, buf, {
      contentType: "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(
      uploadError.message ?? "Supabase Storage upload failed for .spz",
    );
  }

  const { data: pub } = admin.storage
    .from(SPZ_STORAGE_BUCKET)
    .getPublicUrl(objectPath);

  const publicUrl = pub.publicUrl;
  logger.info(
    { tourId: opts.tourId, objectPath, bytes: buf.byteLength },
    "Mirrored SPZ to Supabase Storage",
  );
  return publicUrl;
}
