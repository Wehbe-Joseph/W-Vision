import { Router } from "express";
import {
  classifyListingImages,
  groupClassificationsIntoScenes,
} from "../services/imageClassifier";

const router = Router();

interface ClassifyBody {
  imageUrls?: unknown;
}

/**
 * POST /api/classify-listing
 *
 * Body: { imageUrls: string[] }
 *
 * Classifies each image with Gemini 2.5 Flash Lite and groups the results
 * into scenes (one per detected room type). Always returns 200 — individual
 * images that fail are returned with `fallback: true`.
 */
router.post("/classify-listing", async (req, res) => {
  const body = (req.body ?? {}) as ClassifyBody;
  const urls = Array.isArray(body.imageUrls)
    ? (body.imageUrls.filter((u) => typeof u === "string") as string[])
    : [];

  if (urls.length === 0) {
    return res.status(400).json({
      error: "imageUrls must be a non-empty array of strings",
      code: "INVALID_INPUT",
    });
  }

  try {
    const classifications = await classifyListingImages(urls);
    const scenes = groupClassificationsIntoScenes(classifications);
    return res.json({
      success: true,
      counts: {
        total: classifications.length,
        recommended: classifications.filter((c) => c.recommendedFor3d).length,
        fallback: classifications.filter((c) => c.fallback).length,
        scenes: scenes.length,
      },
      classifications,
      scenes,
    });
  } catch (err) {
    req.log.error({ err }, "classify-listing failed");
    return res.status(500).json({ error: "Classification failed", code: "UNKNOWN" });
  }
});

export default router;
