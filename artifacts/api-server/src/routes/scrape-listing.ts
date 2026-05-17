import { Router } from "express";
import {
  getListingData,
  detectPlatform,
  ListingScrapeError,
} from "../services/listings";

const router = Router();

interface ScrapeListingBody {
  url?: unknown;
}

/**
 * POST /api/scrape-listing
 *
 * Body: { url: string }
 *
 * Returns the normalized ListingData payload. Errors map to:
 *   400 invalid URL / unsupported platform
 *   404 actor returned no results
 *   502 actor failed
 *   503 APIFY_TOKEN missing
 *   504 actor timed out
 */
router.post("/scrape-listing", async (req, res) => {
  const body = (req.body ?? {}) as ScrapeListingBody;
  const url = typeof body.url === "string" ? body.url.trim() : "";

  if (!url) {
    return res
      .status(400)
      .json({ error: "Missing required field: url", code: "INVALID_URL" });
  }

  try {
    const data = await getListingData(url);
    return res.json({
      success: true,
      platform: data.platform,
      data,
    });
  } catch (err) {
    if (err instanceof ListingScrapeError) {
      req.log.warn(
        { code: err.code, status: err.status, url },
        "scrape-listing rejected",
      );
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        platform: detectPlatform(url),
      });
    }
    req.log.error({ err }, "scrape-listing unexpected error");
    return res.status(500).json({
      error: "Internal server error",
      code: "UNKNOWN",
    });
  }
});

export default router;
