import { type ImageClassification, type RoomType } from "./gemini";

/**
 * A "scene" is a set of photos that should be sent to Marble together to
 * produce ONE 3D world. We group by `roomType` so each room of the home
 * (Living Room, Master Bedroom, Bathroom, …) becomes its own walkable space.
 *
 * Future enhancement: visually cluster bedrooms so two bedrooms in the same
 * listing become two separate scenes (Bedroom 1, Bedroom 2). Right now we
 * keep it simple — one scene per detected room type.
 */
export interface SceneGroup {
  /** Stable identifier within a tour, e.g. "living-room" or "master-bedroom". */
  id: string;
  /** Display label shown in the room sidebar. */
  label: string;
  roomType: RoomType;
  /** Best photo (highest quality * wow) — used as the sidebar thumbnail. */
  thumbnailUrl: string;
  /** All photos that belong in this 3D world, ordered best-first. */
  imageUrls: string[];
  /** Per-image classifications, retained for debugging / future tuning. */
  classifications: ImageClassification[];
  /** True when at least one photo in the group passed Gemini's 3D filter. */
  recommendedFor3d: boolean;
}

const ROOM_PRIORITY: Record<RoomType, number> = {
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

export function groupClassificationsIntoScenes(
  classifications: ImageClassification[],
): SceneGroup[] {
  // Bucket by roomType.
  const buckets = new Map<RoomType, ImageClassification[]>();
  for (const c of classifications) {
    if (!buckets.has(c.roomType)) buckets.set(c.roomType, []);
    buckets.get(c.roomType)!.push(c);
  }

  const groups: SceneGroup[] = [];
  for (const [roomType, items] of buckets) {
    // Sort by quality + wow descending so the best photo leads the group.
    const sorted = [...items].sort(
      (a, b) =>
        b.qualityScore + b.wowFactor - (a.qualityScore + a.wowFactor),
    );
    const recommended = sorted.filter((c) => c.recommendedFor3d);
    groups.push({
      id: slugify(roomType),
      label: roomType,
      roomType,
      thumbnailUrl: sorted[0].imageUrl,
      imageUrls: sorted.map((c) => c.imageUrl),
      classifications: sorted,
      recommendedFor3d: recommended.length > 0,
    });
  }

  return groups.sort(
    (a, b) => ROOM_PRIORITY[a.roomType] - ROOM_PRIORITY[b.roomType],
  );
}
