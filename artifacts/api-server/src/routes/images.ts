import { Router } from "express";
import multer from "multer";
import { storeImage, getImage, getPublicBaseUrl } from "../lib/imageStore";

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

// POST /images/upload — multipart, returns public URLs WorldLabs can fetch
router.post("/images/upload", upload.array("images", 20), (req, res) => {
  const userId =
    (req.user as { id?: string } | undefined)?.id ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No images provided" });
  }

  const baseUrl = getPublicBaseUrl(req as Parameters<typeof getPublicBaseUrl>[0]);
  const images = files.map((file) => {
    const id = storeImage(file.buffer, file.mimetype);
    return {
      id,
      url: `${baseUrl}/api/images/${id}`,
      name: file.originalname,
      size: file.size,
    };
  });

  return res.json({ images });
});

// GET /images/:id — public, no auth required (WorldLabs fetches from here)
router.get("/images/:id", (req, res) => {
  const image = getImage(req.params.id);
  if (!image) {
    return res.status(404).json({ error: "Image not found or expired" });
  }
  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("Cache-Control", "public, max-age=7200");
  res.send(image.data);
});

export default router;
