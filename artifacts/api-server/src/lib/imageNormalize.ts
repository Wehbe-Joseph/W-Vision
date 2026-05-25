import { logger } from "./logger";

/** Decode AVIF/WebP/PNG/etc. to JPEG for OpenAI image edit and Gemini vision. */
export async function normalizeToJpeg(buffer: Buffer): Promise<Buffer> {
  if (buffer.length < 64) {
    throw new Error("Image buffer too small");
  }
  try {
    const { default: sharp } = await import("sharp");
    return await sharp(buffer).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  } catch (err) {
    logger.warn({ err, bytes: buffer.length }, "sharp normalize failed");
    throw err;
  }
}
