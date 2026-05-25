import { Router } from "express";
import multer from "multer";
import { uploadTourImage } from "../lib/imageStorage";
import { getImage } from "../lib/imageStore";
import { requireProfileId } from "../lib/resolveProfileId";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// POST /images/upload — multipart (local dev); production prefers JSON on generate-tour.
router.post("/images/upload", (req, res, next) => {
  upload.array("images", 20)(req, res, (err) => {
    if (err) {
      req.log.warn({ err }, "multipart parse failed");
      return res.status(400).json({
        error: "Invalid upload",
        detail: err instanceof Error ? err.message : "Could not parse images",
      });
    }
    next();
  });
}, async (req, res) => {
  const userId = await requireProfileId(req);
  if (!userId) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Sign in required to upload photos.",
    });
  }

  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No images provided" });
  }

  try {
    const images = await Promise.all(
      files.map(async (file) => {
        const { key, publicUrl } = await uploadTourImage(
          file.buffer,
          file.mimetype,
          userId,
          req,
        );
        return {
          id: key,
          url: publicUrl,
          name: file.originalname,
          size: file.size,
        };
      }),
    );

    return res.json({ images });
  } catch (err) {
    req.log.error({ err }, "Failed to upload images to Supabase Storage");
    return res.status(500).json({
      error: "Image upload failed",
      detail: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

// GET /images/:id — legacy in-memory fallback, kept for backwards compat
// with old tour records that still hold the old URL shape.
router.get("/images/:id", (req, res) => {
  const image = getImage(req.params.id);
  if (!image) {
    res.status(404).json({ error: "Image not found or expired" });
    return;
  }
  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("Cache-Control", "public, max-age=7200");
  res.send(image.data);
});

export default router;
