import { type ImageClassification } from "./gemini";

/**
 * One walkable 3D room in the tour. Marble gets exactly ONE photo —
 * the best-ranked image in this room group.
 */
export interface SceneGroup {
  /** Stable identifier within a tour, e.g. "living-room" or "master-bedroom". */
  id: string;
  /** Display label shown in the room sidebar. */
  label: string;
  roomType: ImageClassification["roomType"];
  /** Best photo (sidebar thumbnail). Same as `worldImageUrl`. */
  thumbnailUrl: string;
  /** Single photo sent to World Labs Marble for this room. */
  worldImageUrl: string;
  /** Gemini classifications for all photos in this room (debug / UI). */
  classifications: ImageClassification[];
  /** True when the selected photo passed Gemini's 3D filter. */
  recommendedFor3d: boolean;
}

const ROOM_PRIORITY: Record<ImageClassification["roomType"], number> = {
  "Living Room": 1,
  "Kitchen": 2,
  "Master Bedroom": 3,
  "Bedroom": 4,
  "Dining Room": 5,
  "Bathroom": 6,
  "Hallway": 7,
  "Balcony": 8,
  "Garden": 9,
  "Garage": 10,
  "Exterior": 11,
  "Other": 12,
};

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Highest quality + wow score wins; prefer photos flagged for 3D. */
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
    (a, b) => ROOM_PRIORITY[a.roomType] - ROOM_PRIORITY[b.roomType],
  );
}
