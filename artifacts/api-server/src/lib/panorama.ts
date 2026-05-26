import OpenAI from "openai";
import fs from "fs";
import os from "os";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";
import { uploadTourImage } from "./imageStorage";
import { normalizeToJpeg } from "./imageNormalize";
import { logger } from "./logger";
import { resolvePublicApiBaseUrl } from "./resolvePublicApiBaseUrl";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
}

function panoramaOutputSize(): string {
  const custom = process.env.PANORAMA_IMAGE_SIZE?.trim();
  if (custom) return custom;
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
  if (model.startsWith("gpt-image-2")) return "2048x1024";
  return "1536x1024";
}

/**
 * Spatial layout instructions without any invented decor — materials must come from refs only.
 */
function buildPanoramaPrompt(roomType: string, referenceCount: number): string {
  const refLayout =
    referenceCount >= 4
      ? "Reference 1: centre of frame. Reference 2: right quarter. Reference 3: left and right edges (seam). Reference 4: left quarter (90° CCW from Reference 1), inferred from the same room."
      : referenceCount >= 2
        ? "Spread references around the 360° horizon; keep the same room continuous at the left/right seam."
        : "Expand this single view into a full 360° of the same room.";

  return [
    `Using the attached reference image(s) of the same ${roomType}, generate a 360-degree equirectangular panorama of this exact space.`,
    "Unwrap the full spherical view onto a flat rectangle: horizontal axis = 360° rotation, vertical axis = 180° (ceiling to floor).",
    refLayout,
    "Horizon at the exact vertical centre. Architectural lines curve toward top/bottom edges (spherical distortion). Left and right edges must match seamlessly.",
    "CRITICAL: Preserve ONLY what is visible in the references — walls, floors, ceiling, windows, doors, furniture, appliances, colours, materials, lighting, and layout. Do not invent a different home or add decor not shown in the photos.",
    "Camera: fixed point at room centre, eye level ~1.6m, as a 360° camera in this exact space.",
    "No people, text, logos, or watermarks. Photorealistic equirectangular output.",
  ].join(" ");
}

function isServerlessDeploy(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function tourvisionPublicPanoramasDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../tourvision/public/panoramas");
}

function localPanoramaDir(): string {
  if (isServerlessDeploy()) {
    return path.join(os.tmpdir(), "wvision-panoramas");
  }
  return tourvisionPublicPanoramasDir();
}

function canWriteLocalPanoramaFiles(): boolean {
  return !isServerlessDeploy();
}

function downloadImage(url: string, filepath: string, redirectCount = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 8) {
      reject(new Error("Too many redirects"));
      return;
    }
    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(filepath);
    const req = protocol.get(url, { headers: FETCH_HEADERS }, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        file.close();
        fs.unlink(filepath, () => {});
        const next = new URL(response.headers.location, url).href;
        downloadImage(next, filepath, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }
      if (response.statusCode && response.statusCode >= 400) {
        file.close();
        fs.unlink(filepath, () => {});
        reject(new Error(`HTTP ${response.statusCode} downloading image`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    });
    req.on("error", (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith("https") ? https : http;

    const doGet = (url: string, redirects: number) => {
      if (redirects > 8) {
        reject(new Error("Too many redirects"));
        return;
      }
      protocol
        .get(url, { headers: FETCH_HEADERS }, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            const next = new URL(res.headers.location, url).href;
            doGet(next, redirects + 1);
            return;
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} fetching ${url.slice(0, 80)}`));
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", reject);
        })
        .on("error", reject);
    };

    doGet(imageUrl, 0);
  });
}

function mimeFromBuffer(buf: Buffer): { mime: string; ext: string } {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { mime: "image/png", ext: "png" };
  }
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return { mime: "image/jpeg", ext: "jpg" };
}

async function buffersToImageFiles(buffers: Buffer[]): Promise<File[]> {
  const files: File[] = [];
  for (let i = 0; i < buffers.length; i++) {
    const { mime, ext } = mimeFromBuffer(buffers[i]!);
    const blob = new Blob([buffers[i]!], { type: mime });
    files.push(new File([blob], `room-${i + 1}.${ext}`, { type: mime }));
  }
  return files;
}

/** AI 360° generation is on by default; set DISABLE_AI_PANORAMA=true to skip. */
export function isAiPanoramaEnabled(): boolean {
  return process.env.DISABLE_AI_PANORAMA !== "true";
}

/**
 * Generate a 360° panorama from listing reference photo(s).
 * Pass multiple URLs from the same room for better consistency.
 */
export async function generatePanorama(
  imageUrls: string | string[],
  roomType: string,
  tourId: string,
): Promise<string | null> {
  const urls = (Array.isArray(imageUrls) ? imageUrls : [imageUrls]).filter((u) =>
    u.startsWith("http"),
  );
  if (urls.length === 0) return null;

  try {
    logger.info({ roomType, tourId, refs: urls.length }, "Generating panorama");

    const refUrls = urls.slice(0, 4);
    const buffers: Buffer[] = [];
    for (const url of refUrls) {
      try {
        const buf = await fetchImageBuffer(url);
        if (buf.length < 2048) {
          logger.warn(
            { tourId, roomType, bytes: buf.length, url: url.slice(0, 80) },
            "Reference image too small — skipping",
          );
          continue;
        }
        const jpeg = await normalizeToJpeg(buf);
        buffers.push(jpeg);
      } catch (err) {
        logger.warn(
          { err, tourId, roomType, url: url.slice(0, 80) },
          "Failed to download or normalize reference image",
        );
      }
    }

    if (buffers.length === 0) {
      logger.error({ tourId, roomType }, "No reference images downloaded for panorama");
      return null;
    }

    const openai = getOpenAI();
    const imageFiles = await buffersToImageFiles(buffers);
    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
    const size = panoramaOutputSize();

    logger.info(
      { roomType, tourId, model, size, refBytes: buffers.map((b) => b.length) },
      "Calling OpenAI images.edit",
    );

    // gpt-image-* always returns base64 in data[0].b64_json — response_format is invalid here.
    const response = await openai.images.edit({
      model,
      image: imageFiles.length === 1 ? imageFiles[0]! : imageFiles,
      prompt: buildPanoramaPrompt(roomType, imageFiles.length),
      n: 1,
      size: size as "1024x1024",
      quality: "high",
      input_fidelity: "high",
    });

    const b64 = response.data?.[0]?.b64_json;
    const generatedUrl = response.data?.[0]?.url;

    let imageBuffer: Buffer | null = null;
    if (b64) {
      imageBuffer = Buffer.from(b64, "base64");
      logger.info(
        { roomType, tourId, bytes: imageBuffer.length },
        "OpenAI returned b64_json panorama",
      );
    } else if (generatedUrl) {
      const dir = localPanoramaDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tempPath = path.join(dir, `_tmp-${tourId}-${Date.now()}.jpg`);
      await downloadImage(generatedUrl, tempPath);
      imageBuffer = fs.readFileSync(tempPath);
      fs.unlinkSync(tempPath);
      logger.info({ roomType, tourId }, "OpenAI returned url panorama");
    }

    if (!imageBuffer || imageBuffer.length < 2048) {
      logger.error(
        { roomType, tourId, hasB64: !!b64, hasUrl: !!generatedUrl },
        "No usable image data returned from OpenAI",
      );
      return null;
    }

    const slug = roomType.toLowerCase().replace(/\s+/g, "-");
    const filename = `${tourId}-${slug}-${Date.now()}.jpg`;

    let publicUrl: string | null = null;
    let uploadIsLocal = false;
    try {
      const uploaded = await uploadTourImage(
        imageBuffer,
        "image/jpeg",
        `panoramas/${tourId}`,
      );
      publicUrl = uploaded.publicUrl;
      uploadIsLocal = uploaded.isLocal;
    } catch (uploadErr) {
      logger.warn({ err: uploadErr, tourId }, "Supabase panorama upload failed");
    }

    if (isServerlessDeploy() && (!publicUrl || uploadIsLocal)) {
      logger.error(
        { tourId, roomType, hasUrl: !!publicUrl, uploadIsLocal },
        "Panorama must be stored in Supabase on Vercel — check SUPABASE_URL and service role key",
      );
      return null;
    }

    if (canWriteLocalPanoramaFiles()) {
      const localDir = tourvisionPublicPanoramasDir();
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      const filepath = path.join(localDir, filename);
      try {
        fs.writeFileSync(filepath, imageBuffer);
      } catch (writeErr) {
        logger.warn({ err: writeErr, tourId, filepath }, "Local panorama file write skipped");
      }
    }

    const relativePath = `/panoramas/${filename}`;
    const origin =
      process.env.TOURVISION_PUBLIC_URL?.replace(/\/$/, "") ||
      resolvePublicApiBaseUrl().replace(/\/$/, "");

    const panoramaUrl = publicUrl ?? `${origin}${relativePath}`;
    logger.info({ panoramaUrl, roomType, storedInSupabase: !uploadIsLocal }, "Panorama saved");
    return panoramaUrl;
  } catch (error) {
    logger.error({ err: error, roomType, tourId }, "Panorama generation failed");
    return null;
  }
}
