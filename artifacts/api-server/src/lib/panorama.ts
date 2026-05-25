import OpenAI from "openai";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";
import { uploadTourImage } from "./imageStorage";
import { logger } from "./logger";
import { resolvePublicApiBaseUrl } from "./resolvePublicApiBaseUrl";

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
}

const PANORAMA_PROMPT = `Using the attached reference images of the same interior space, generate a 360-degree equirectangular panorama projection of this exact room. Generate the full spherical view of this space unwrapped onto a flat rectangle. The horizontal axis spans 360 degrees of camera rotation: Reference 1 occupies the centre of the frame, Reference 2 occupies the right quarter, Reference 3 spans the left and right edges (at the seam), and the fourth unseen wall (rotated 90 degrees counter-clockwise from Reference 1) occupies the left quarter - infer this view from the references, showing continuation of the same architectural language. Vertical axis spans 180 degrees from ceiling to floor. Straight architectural lines curve as they approach the top and bottom edges due to spherical distortion. Horizon line sits at the exact vertical centre. Preserve exactly: all materials, colours, finishes, furniture, lighting conditions, architectural details, and atmosphere from the references. Terracotta plaster walls, oak joinery, travertine island, natural linen upholstery, polished terracotta micro-cement floor, black linear track lighting, Noguchi-style pendant, late golden hour light. Camera position: single fixed point at the centre of the room, eye level 1.6m. This is what a 360 camera would capture if placed in this exact space. The left and right edges of the image must match seamlessly, both edges depict the same point in 3D space (the area shown at the centre of Reference 3). Format: equirectangular projection, photorealistic, cinematic, no text, no people.`;

function tourvisionPublicPanoramasDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../tourvision/public/panoramas");
}

function downloadImage(url: string, filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(filepath);
    protocol
      .get(url, (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          file.close();
          fs.unlink(filepath, () => {});
          downloadImage(response.headers.location, filepath)
            .then(resolve)
            .catch(reject);
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
      });
  });
}

async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith("https") ? https : http;
    protocol
      .get(imageUrl, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

/**
 * Generate a 360° equirectangular panorama from a room photo via OpenAI,
 * persist to Supabase (production) and tourvision/public/panoramas (local).
 */
export async function generatePanorama(
  imageUrl: string,
  roomType: string,
  tourId: string,
): Promise<string | null> {
  try {
    logger.info({ roomType, tourId }, "Generating panorama");

    const openai = getOpenAI();
    const referenceBuffer = await fetchImageBuffer(imageUrl);
    const referenceBlob = new Blob([referenceBuffer], { type: "image/jpeg" });
    const referenceFile = new File([referenceBlob], "room.jpg", {
      type: "image/jpeg",
    });

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: referenceFile,
      prompt: PANORAMA_PROMPT,
      n: 1,
      size: "1536x1024",
      quality: "low",
    });

    const b64 = response.data?.[0]?.b64_json;
    const generatedUrl = response.data?.[0]?.url;

    let imageBuffer: Buffer | null = null;
    if (b64) {
      imageBuffer = Buffer.from(b64, "base64");
    } else if (generatedUrl) {
      const dir = tourvisionPublicPanoramasDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tempPath = path.join(
        dir,
        `_tmp-${tourId}-${Date.now()}.jpg`,
      );
      await downloadImage(generatedUrl, tempPath);
      imageBuffer = fs.readFileSync(tempPath);
      fs.unlinkSync(tempPath);
    }

    if (!imageBuffer) {
      logger.error({ roomType }, "No image data returned from OpenAI");
      return null;
    }

    const slug = roomType.toLowerCase().replace(/\s+/g, "-");
    const filename = `${tourId}-${slug}.jpg`;

    const localDir = tourvisionPublicPanoramasDir();
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const filepath = path.join(localDir, filename);
    fs.writeFileSync(filepath, imageBuffer);

    // Always persist file locally (served from tourvision/public/panoramas).
    const relativePath = `/panoramas/${filename}`;

    let publicUrl: string | null = null;
    try {
      const uploaded = await uploadTourImage(
        imageBuffer,
        "image/jpeg",
        `panoramas/${tourId}`,
      );
      publicUrl = uploaded.publicUrl;
    } catch (uploadErr) {
      logger.warn({ err: uploadErr, tourId }, "Supabase panorama upload failed");
    }

    const origin =
      process.env.TOURVISION_PUBLIC_URL?.replace(/\/$/, "") ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : resolvePublicApiBaseUrl().replace(/\/$/, ""));

    const panoramaUrl = publicUrl ?? `${origin}${relativePath}`;
    logger.info({ panoramaUrl, roomType, relativePath }, "Panorama saved");
    return panoramaUrl;
  } catch (error) {
    logger.error({ err: error, roomType, tourId }, "Panorama generation failed");
    return null;
  }
}
