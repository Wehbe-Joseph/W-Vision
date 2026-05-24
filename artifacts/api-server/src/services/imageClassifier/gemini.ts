import { logger } from "../../lib/logger";

/**
 * Google Gemini image classifier (gemini-2.5-flash-lite) for real-estate photos.
 *
 * The classifier scores each photo on room type, photo quality, "wow" factor,
 * and whether it's a good candidate for 3D world generation. Results group
 * naturally by `roomType`, which the tour pipeline uses to group photos per room.
 *
 * Resilience model:
 *   - One bad image never breaks the batch — failures are logged and skipped.
 *   - Images are processed in batches of 5 (Gemini's free tier rate limits).
 *   - When `GEMINI_API_KEY` is missing, the classifier returns synthetic
 *     fallback labels so the rest of the pipeline keeps working.
 */

export type RoomType =
  | "Living Room"
  | "Kitchen"
  | "Master Bedroom"
  | "Bedroom"
  | "Bathroom"
  | "Dining Room"
  | "Balcony"
  | "Garden"
  | "Garage"
  | "Exterior"
  | "Hallway"
  | "Other";

export const ROOM_TYPES: RoomType[] = [
  "Living Room",
  "Kitchen",
  "Master Bedroom",
  "Bedroom",
  "Bathroom",
  "Dining Room",
  "Balcony",
  "Garden",
  "Garage",
  "Exterior",
  "Hallway",
  "Other",
];

export interface ImageClassification {
  imageUrl: string;
  roomType: RoomType;
  qualityScore: number;
  wowFactor: number;
  /** quality_score + wow_factor — used to pick one photo per room. */
  combinedScore: number;
  isInterior: boolean;
  isWideAngle: boolean;
  recommendedFor3d: boolean;
  /** Set when this photo is the best pick for its room group. */
  isBestInRoom?: boolean;
  /** Set when classification fell back to a heuristic / synthetic label. */
  fallback?: boolean;
  /** Optional error message for the bad image (only when fallback=true). */
  error?: string;
}

const MODEL = "gemini-2.5-flash-lite";
const BATCH_SIZE = 5;
const REQUEST_TIMEOUT_MS = 30_000;

const PROMPT = `You are analyzing a real estate listing photo.
Return ONLY valid JSON.
No explanation. No markdown.
No code blocks. Pure JSON only.

{
  "room_type": one of exactly these values:
    "Living Room" | "Kitchen" |
    "Master Bedroom" | "Bedroom" |
    "Bathroom" | "Dining Room" |
    "Balcony" | "Garden" |
    "Garage" | "Exterior" |
    "Hallway" | "Other",
  "quality_score": number 1-10,
  "wow_factor": number 1-10,
  "is_interior": boolean,
  "is_wide_angle": boolean,
  "recommended_for_3d": boolean
}

quality_score rules:
10 = bright, sharp, wide angle, beautiful, no clutter
1 = dark, blurry, cluttered, too close, poor

wow_factor rules:
10 = makes buyer want to be there
1 = completely unimpressive

recommended_for_3d = true only when:
quality_score >= 7 AND wow_factor >= 6 AND is_interior = true`;

interface GeminiRequestBody {
  contents: {
    parts: ({ text: string } | { inline_data: { mime_type: string; data: string } })[];
  }[];
  generationConfig: {
    temperature: number;
    response_mime_type: string;
  };
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
  error?: { message?: string };
}

/**
 * Classify a single image. Never throws — on failure returns a fallback
 * classification (`fallback: true`) with the underlying error.
 */
export async function classifyListingImage(
  imageUrl: string,
): Promise<ImageClassification> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return synthesizeFallback(
      imageUrl,
      "GEMINI_API_KEY not set — using fallback classification",
    );
  }

  try {
    const { data, mimeType } = await fetchImageAsBase64(imageUrl);
    const body: GeminiRequestBody = {
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        response_mime_type: "application/json",
      },
    };

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent` +
      `?key=${encodeURIComponent(apiKey)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, imageUrl, body: errBody.slice(0, 200) },
        "Gemini classification failed",
      );
      return synthesizeFallback(
        imageUrl,
        `Gemini HTTP ${res.status}: ${errBody.slice(0, 120)}`,
      );
    }

    const json = (await res.json()) as GeminiResponse;
    if (json.error) {
      return synthesizeFallback(imageUrl, json.error.message ?? "Gemini error");
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return parseClassification(imageUrl, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, imageUrl }, "Gemini classification threw");
    return synthesizeFallback(imageUrl, message);
  }
}

/**
 * Classify many images concurrently, in batches of 5 to respect the Gemini
 * free-tier rate limit (~15 RPM). Always resolves — never rejects.
 */
export async function classifyListingImages(
  imageUrls: string[],
  opts: { batchSize?: number; onBatch?: (batchIndex: number) => void } = {},
): Promise<ImageClassification[]> {
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const out: ImageClassification[] = [];

  for (let i = 0; i < imageUrls.length; i += batchSize) {
    const batch = imageUrls.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(classifyListingImage));
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status === "fulfilled") {
        out.push(r.value);
      } else {
        out.push(
          synthesizeFallback(
            batch[j],
            r.reason instanceof Error ? r.reason.message : String(r.reason),
          ),
        );
      }
    }
    opts.onBatch?.(Math.floor(i / batchSize));
  }

  return out;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchImageAsBase64(
  imageUrl: string,
): Promise<{ data: string; mimeType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(imageUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Image fetch failed: HTTP ${res.status}`);
    }
    const mimeType = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf.toString("base64"), mimeType };
  } finally {
    clearTimeout(timer);
  }
}

function parseClassification(
  imageUrl: string,
  text: string,
): ImageClassification {
  // Gemini occasionally wraps JSON in fences despite our instructions —
  // strip them defensively before parsing.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const raw = JSON.parse(cleaned) as Record<string, unknown>;
    const roomType = normalizeRoomType(raw.room_type);
    const qualityScore = clampNum(raw.quality_score, 1, 10, 5);
    const wowFactor = clampNum(raw.wow_factor, 1, 10, 5);
    return {
      imageUrl,
      roomType,
      qualityScore,
      wowFactor,
      combinedScore: qualityScore + wowFactor,
      isInterior: typeof raw.is_interior === "boolean" ? raw.is_interior : true,
      isWideAngle:
        typeof raw.is_wide_angle === "boolean" ? raw.is_wide_angle : false,
      recommendedFor3d:
        typeof raw.recommended_for_3d === "boolean"
          ? raw.recommended_for_3d
          : false,
    };
  } catch (err) {
    logger.warn(
      { err, imageUrl, text: text.slice(0, 200) },
      "Failed to parse Gemini JSON — using fallback",
    );
    return synthesizeFallback(imageUrl, "Failed to parse Gemini response");
  }
}

function normalizeRoomType(v: unknown): RoomType {
  if (typeof v !== "string") return "Other";
  const match = ROOM_TYPES.find(
    (r) => r.toLowerCase() === v.toLowerCase().trim(),
  );
  return match ?? "Other";
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function synthesizeFallback(
  imageUrl: string,
  error: string,
): ImageClassification {
  return {
    imageUrl,
    roomType: "Other",
    qualityScore: 5,
    wowFactor: 5,
    combinedScore: 10,
    isInterior: true,
    isWideAngle: false,
    recommendedFor3d: false,
    fallback: true,
    error,
  };
}
