import { waitUntil } from "@vercel/functions";
import { Router } from "express";
import { db } from "@workspace/db";
import { toursTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { getListingData } from "../services/listings";
import { uploadDataUrlToStorage } from "../lib/imageStorage";
import {
  createMemTour,
  getMemTour,
  type MemScene,
} from "../lib/tourMemoryStore";
import {
  runFullTourPipeline,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "../lib/tourPipeline";
import { advanceTourGeneration } from "../lib/tourGenerationDriver";
import { saveTourSourceImages } from "../lib/tourGenerationDriver";
import {
  classifyListingImages,
  filterClassificationsForTour,
  groupClassificationsIntoScenes,
} from "../services/imageClassifier";
import { saveClassifiedPhotosToDb } from "../lib/tourPhotoPersistence";
import { runPanoramaGeneration } from "../lib/panoramaPipeline";
import { notifyAgentTourReady } from "../lib/tourNotify";
import { queuePersistTourScenes } from "../lib/tourScenesPersistence";
import { requireProfileId } from "../lib/resolveProfileId";
import { filterListingImageUrls } from "../lib/listingImageFilter";
const router = Router();

async function userIdFromReq(req: Parameters<typeof requireProfileId>[0]) {
  return requireProfileId(req);
}

function generateShareToken() {
  return randomBytes(12).toString("hex");
}

function detectPlatform(url: string): string {
  if (url.includes("zillow")) return "zillow";
  if (url.includes("airbnb")) return "airbnb";
  if (url.includes("bayut")) return "bayut";
  if (url.includes("propertyfinder")) return "property_finder";
  return "other";
}

function serializeScene(s: MemScene) {
  return {
    id: s.id,
    label: s.label,
    roomType: s.roomType,
    thumbnailUrl: s.thumbnailUrl,
    imageCount: s.imageUrls.length,
    generationStatus: s.generationStatus,
    generatedTourUrl: s.generatedTourUrl,
    errorMessage: s.errorMessage,
    locked: false,
  };
}

function buildStatusPayload(tourId: string, userId: string) {
  const mem = getMemTour(tourId);
  if (!mem || mem.userId !== userId) return null;

  const stage = mem.pipelineStage ?? inferStage(mem);
  const roomsTotal = mem.roomsDetected ?? mem.scenes.length;
  const roomsReady = mem.roomsReady ?? 0;

  return {
    tourId,
    shareToken: mem.shareToken,
    status: mem.generationStatus === "completed" ? "ready" : "processing",
    generationStatus: mem.generationStatus,
    pipelineStage: stage,
    pipelineStageLabel: PIPELINE_STAGE_LABELS[stage],
    currentStage: mem.currentStage,
    roomsTotal,
    roomsReady,
    roomsDetected: roomsTotal,
    generatedTourUrl: mem.generatedTourUrl,
    previewImageUrl: mem.previewImageUrl,
    errorMessage: mem.errorMessage,
    scenes: mem.scenes.map(serializeScene),
  };
}

function inferStage(mem: {
  generationStatus: string;
  scenes: unknown[];
  currentStage: string;
}): PipelineStage {
  if (mem.generationStatus === "completed") return 4;
  const s = mem.currentStage.toLowerCase();
  if (s.includes("generating") || s.includes("panorama")) return 3;
  if (s.includes("classif")) return 2;
  if (mem.scenes.length > 0) return 3;
  return 1;
}

function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    )
  );
}

// POST /tours/create
router.post("/tours/create", async (req, res) => {
  const userId = await userIdFromReq(req);
  if (!userId) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Sign in required.",
    });
  }

  const listingUrl =
    typeof req.body?.listingUrl === "string" ? req.body.listingUrl.trim() : "";
  if (!listingUrl) return res.status(400).json({ error: "listingUrl required" });
  const floorCount =
    typeof req.body?.floorCount === "number" ? req.body.floorCount : undefined;
  const shareToken = generateShareToken();
  const platform = detectPlatform(listingUrl);

  let tourId = randomBytes(16).toString("hex");
  try {
    const [row] = await db
      .insert(toursTable)
      .values({
        userId,
        listingUrl,
        listingPlatform: platform,
        listingAddress:
          listingUrl === "manual-upload"
            ? "Uploaded photos"
            : `Property at ${listingUrl.split("/")[2] ?? listingUrl}`,
        status: "pending",
        shareToken,
        floorCount: floorCount ?? 1,
        isFullHouse: true,
        isWatermarked: false,
        generationStatus: "queued",
        currentStage: "Extracting photos…",
        tourType: "panorama",
      })
      .returning();
    tourId = row!.id;
  } catch {
    req.log.warn("DB unavailable for tour create — using ephemeral id");
  }

  createMemTour({
    tourId,
    userId,
    shareToken,
    listingUrl,
    listingAddress:
      listingUrl === "manual-upload"
        ? "Uploaded photos"
        : `Property at ${listingUrl.split("/")[2] ?? listingUrl}`,
    listingPlatform: platform,
    operationId: null,
    worldId: null,
    generationStatus: "queued",
    currentStage: "Extracting photos…",
    generatedTourUrl: null,
    previewImageUrl: null,
    errorMessage: null,
    imageCount: 0,
    viewCount: 0,
    completedAt: null,
    expiresAt: null,
    frozen: false,
    createdOnTier: "free",
    fullHouseUnlocked: false,
    scenes: [],
    pipelineStage: 1,
  });

  return res.json({ tourId, shareToken });
});

// POST /tours/extract
router.post("/tours/extract", async (req, res) => {
  const userId = await userIdFromReq(req);
  if (!userId) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Sign in required.",
    });
  }

  const tourId = req.body?.tourId;
  if (!isUuid(tourId)) return res.status(400).json({ error: "Invalid tourId" });
  const listingUrl =
    typeof req.body?.listingUrl === "string" ? req.body.listingUrl : undefined;
  const imageUrls = Array.isArray(req.body?.imageUrls)
    ? req.body.imageUrls.filter((u: unknown) => typeof u === "string")
    : [];
  const uploadedImages = Array.isArray(req.body?.uploadedImages)
    ? req.body.uploadedImages
    : [];
  const mem = getMemTour(tourId);
  if (!mem || mem.userId !== userId) {
    return res.status(404).json({ error: "Tour not found" });
  }

  const collected: string[] = [...imageUrls.filter((u) => u.startsWith("https://"))];

  if (listingUrl && listingUrl !== "manual-upload") {
    try {
      const listing = await getListingData(listingUrl);
      for (const img of listing.images ?? []) {
        if (img.url?.startsWith("https://")) collected.push(img.url);
      }
    } catch (err) {
      req.log.warn({ err, listingUrl }, "Listing scrape failed");
    }
  }

  const uploadedPublic = (
    await Promise.all(
      uploadedImages.map((img) => uploadDataUrlToStorage(img.dataUrl, userId, req)),
    )
  ).filter((u): u is string => !!u);

  collected.push(...uploadedPublic);
  const unique = filterListingImageUrls([...new Set(collected)]);

  mem.sourceImageUrls = unique;
  mem.imageCount = unique.length;
  mem.pipelineStage = 1;
  mem.currentStage = `Extracted ${unique.length} photos`;
  await saveTourSourceImages(tourId, unique, mem);

  try {
    await db
      .update(toursTable)
      .set({
        totalPhotosExtracted: unique.length,
        photosUsed: unique.length,
        currentStage: mem.currentStage,
        status: "processing",
      })
      .where(eq(toursTable.id, tourId));
  } catch {
    /* ignore */
  }

  return res.json({
    tourId,
    imageCount: unique.length,
    imageUrls: unique,
    pipelineStage: 1,
  });
});

// POST /tours/classify
router.post("/tours/classify", async (req, res) => {
  const userId = await userIdFromReq(req);
  if (!userId) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Sign in required.",
    });
  }

  const tourId = req.body?.tourId;
  if (!isUuid(tourId)) return res.status(400).json({ error: "Invalid tourId" });
  const mem = getMemTour(tourId);
  if (!mem || mem.userId !== userId) {
    return res.status(404).json({ error: "Tour not found" });
  }

  const urls = mem.sourceImageUrls ?? [];
  if (urls.length === 0) {
    return res.status(400).json({ error: "No images — run extract first" });
  }

  mem.pipelineStage = 2;
  mem.currentStage = "Classifying rooms with AI…";

  const raw = await classifyListingImages(urls);
  const filtered = filterClassificationsForTour(raw);
  const groups = groupClassificationsIntoScenes(filtered);

  if (groups.length === 0) {
    mem.generationStatus = "failed";
    mem.errorMessage = "No suitable property photos found";
    return res.status(422).json({ error: mem.errorMessage });
  }

  try {
    await saveClassifiedPhotosToDb(tourId, filtered, groups);
  } catch (err) {
    req.log.warn({ err }, "tour_photos save failed");
  }

  mem.scenes = groups.map((g) => ({
    id: g.id,
    label: g.label,
    roomType: g.roomType,
    thumbnailUrl: g.thumbnailUrl,
    imageUrls: [g.worldImageUrl],
    operationId: null,
    worldId: null,
    generationStatus: "queued",
    generatedTourUrl: null,
    errorMessage: null,
    locked: false,
  }));
  mem.roomsDetected = groups.length;
  mem.generationStatus = "processing";
  mem.currentStage = `Classified ${groups.length} rooms`;
  queuePersistTourScenes(tourId);

  try {
    await db
      .update(toursTable)
      .set({
        roomsDetected: groups.length,
        currentStage: mem.currentStage,
        generationStatus: "processing",
      })
      .where(eq(toursTable.id, tourId));
  } catch {
    /* ignore */
  }

  return res.json({
    tourId,
    roomsDetected: groups.length,
    pipelineStage: 2,
    rooms: groups.map((g) => ({
      roomType: g.roomType,
      thumbnailUrl: g.thumbnailUrl,
    })),
  });
});

// POST /tours/generate
router.post("/tours/generate", async (req, res) => {
  const userId = await userIdFromReq(req);
  if (!userId) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Sign in required.",
    });
  }

  const tourId = req.body?.tourId;
  if (!isUuid(tourId)) return res.status(400).json({ error: "Invalid tourId" });
  const mem = getMemTour(tourId);
  if (!mem || mem.userId !== userId) {
    return res.status(404).json({ error: "Tour not found" });
  }

  if (mem.scenes.length === 0) {
    return res.status(400).json({ error: "No rooms — run classify first" });
  }

  res.json({ tourId, started: true, pipelineStage: 3 });

  const groups = mem.scenes.map((s) => ({
    id: s.id,
    label: s.label,
    roomType: s.roomType as import("../services/imageClassifier/gemini").RoomType,
    thumbnailUrl: s.thumbnailUrl,
    worldImageUrl: s.imageUrls[0] ?? s.thumbnailUrl,
    classifications: [],
    recommendedFor3d: true,
  }));

  const work = async () => {
    await runPanoramaGeneration(tourId, groups, req.log);
    const after = getMemTour(tourId);
    if (after?.generationStatus === "completed") {
      after.pipelineStage = 4;
      after.currentStage = "Tour ready";
      void notifyAgentTourReady(tourId);
    }
  };

  if (process.env.VERCEL) {
    waitUntil(work().catch((err) => req.log.error({ err, tourId }, "generate failed")));
  } else {
    work().catch((err) => req.log.error({ err, tourId }, "generate failed"));
  }
});

// GET /tours/status/:tourId
router.get("/tours/status/:tourId", async (req, res) => {
  const userId = await userIdFromReq(req);
  if (!userId) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Sign in required.",
    });
  }

  try {
    await advanceTourGeneration(req.params.tourId, userId, req.log);
  } catch (err) {
    req.log.warn({ err }, "status tick failed");
  }

  const payload = buildStatusPayload(req.params.tourId, userId);
  if (!payload) return res.status(404).json({ error: "Tour not found" });
  return res.json(payload);
});

export default router;
