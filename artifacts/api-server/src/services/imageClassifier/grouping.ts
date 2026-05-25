import { type ImageClassification } from "./gemini";
import { roomNavRank } from "../../lib/roomOrder";

/**
 * One room in the tour. Each group keeps the single best photo for display.
 */
export interface SceneGroup {
  /** Stable identifier within a tour, e.g. "living-room" or "master-bedroom". */
  id: string;
  /** Display label shown in the room sidebar. */
  label: string;
  roomType: ImageClassification["roomType"];
  /** Best photo (sidebar thumbnail). Same as `worldImageUrl`. */
  thumbnailUrl: string;
  /** Best photo URL for this room. */
  worldImageUrl: string;
  /** Gemini classifications for all photos in this room (debug / UI). */
  classifications: ImageClassification[];
  /** True when the selected photo passed Gemini's quality filter. */
  recommendedFor3d: boolean;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Highest quality + wow score wins; prefer photos flagged for tour use. */
export function selectBestPhotoForRoom(
  items: ImageClassification[],
): ImageClassification | null {
  if (items.length === 0) return null;

  const ranked = [...items].sort((a, b) => {
    if (a.recommendedFor3d !== b.recommendedFor3d) {
      return a.recommendedFor3d ? -1 : 1;
    }
    return b.combinedScore - a.combinedScore;
  });

  return ranked[0] ?? null;
}

export function groupClassificationsIntoScenes(
  classifications: ImageClassification[],
): SceneGroup[] {
  const buckets = new Map<ImageClassification["roomType"], ImageClassification[]>();
  for (const c of classifications) {
    if (!buckets.has(c.roomType)) buckets.set(c.roomType, []);
    buckets.get(c.roomType)!.push(c);
  }

  const groups: SceneGroup[] = [];
  for (const [roomType, items] of buckets) {
    const best = selectBestPhotoForRoom(items);
    if (!best) continue;

    for (const item of items) {
      item.isBestInRoom = item.imageUrl === best.imageUrl;
    }

    groups.push({
      id: slugify(roomType),
      label: roomType,
      roomType,
      thumbnailUrl: best.imageUrl,
      worldImageUrl: best.imageUrl,
      classifications: items,
      recommendedFor3d: best.recommendedFor3d,
    });
  }

  return groups.sort(
    (a, b) => roomNavRank(a.roomType) - roomNavRank(b.roomType),
  );
}
