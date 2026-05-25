import { db } from "@workspace/db";
import { tourPhotosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ImageClassification } from "../services/imageClassifier/gemini";
import type { SceneGroup } from "../services/imageClassifier/grouping";
import { logger } from "./logger";

/**
 * Persist every classified image and mark the best pick per room.
 */
export async function saveClassifiedPhotosToDb(
  tourId: string,
  allClassifications: ImageClassification[],
  groups: SceneGroup[],
): Promise<void> {
  try {
    await db.delete(tourPhotosTable).where(eq(tourPhotosTable.tourId, tourId));
  } catch (err) {
    logger.warn({ err, tourId }, "Could not clear prior tour_photos rows");
  }

  const bestUrls = new Set<string>();
  for (const g of groups) {
    const best = g.classifications.find((c) => c.isBestInRoom);
    if (best) bestUrls.add(best.imageUrl);
  }

  const rows = allClassifications.map((c) => ({
    tourId,
    originalUrl: c.imageUrl,
    thumbnailUrl: c.imageUrl,
    roomLabel: c.roomType,
    roomType: c.roomType,
    floorNumber: 1,
    qualityScore: Math.round(c.qualityScore),
    wowFactor: Math.round(c.wowFactor),
    combinedScore: c.combinedScore,
    isPropertyPhoto: c.isPropertyPhoto,
    isSelected: true,
    isBestForRoom: bestUrls.has(c.imageUrl),
    isAiGenerated: Boolean(c.fallback),
    panoramaStatus: "pending" as const,
  }));

  if (rows.length === 0) return;

  try {
    await db.insert(tourPhotosTable).values(rows);
  } catch (err) {
    logger.warn({ err, tourId, count: rows.length }, "Failed to insert tour_photos");
    throw err;
  }
}
