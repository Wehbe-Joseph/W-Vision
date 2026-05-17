import { db } from "@workspace/db";
import { tourPhotosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";

/** Persist mirrored SPZ URL on the best-matching tour_photos row (or insert one). */
export async function saveTourPhotoWorldEmbed(
  tourId: string,
  roomLabel: string,
  worldEmbedUrl: string,
): Promise<void> {
  try {
    const existing = await db.query.tourPhotosTable.findFirst({
      where: and(eq(tourPhotosTable.tourId, tourId), eq(tourPhotosTable.roomLabel, roomLabel)),
    });
    if (existing) {
      await db
        .update(tourPhotosTable)
        .set({ worldEmbedUrl })
        .where(eq(tourPhotosTable.id, existing.id));
      return;
    }
    await db.insert(tourPhotosTable).values({
      tourId,
      roomLabel,
      worldEmbedUrl,
      qualityScore: 5,
      isSelected: true,
      isBestForRoom: false,
      isAiGenerated: false,
    });
  } catch (err) {
    logger.warn({ err, tourId, roomLabel }, "saveTourPhotoWorldEmbed skipped");
  }
}
