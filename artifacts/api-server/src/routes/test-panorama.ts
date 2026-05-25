import { Router } from "express";
import { generatePanorama } from "../lib/panorama";

const router = Router();

/** POST /api/test-panorama — dev endpoint for panorama pipeline smoke test */
router.post("/test-panorama", async (req, res) => {
  try {
    const imageUrl =
      typeof req.body?.imageUrl === "string" ? req.body.imageUrl : "";
    const roomType =
      typeof req.body?.roomType === "string" ? req.body.roomType : "Living Room";

    if (!imageUrl.startsWith("http")) {
      return res.status(400).json({ error: "imageUrl must be an https URL" });
    }

    const tourKey = `test-${Date.now()}`;
    const panoramaUrl = await generatePanorama(imageUrl, roomType, tourKey);

    if (!panoramaUrl) {
      return res.status(502).json({
        error: "Panorama generation failed",
        message: "Check OPENAI_API_KEY and server logs",
      });
    }

    return res.json({ panoramaUrl });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
