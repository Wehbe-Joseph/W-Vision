import { roomNavRank } from "@/lib/roomOrder";

export interface ViewerPanoramaRoom {
  sceneId: string;
  roomType: string;
  panoramaUrl: string;
  floorNumber: number;
  /** Original listing photo — preferred for display when AI panos were used. */
  sourceImageUrl?: string | null;
  isAiGenerated?: boolean;
}

type RoomLike = {
  id?: string;
  roomLabel?: string | null;
  roomType?: string | null;
  panoramaUrl?: string | null;
  thumbnailUrl?: string | null;
  panoramaStatus?: string | null;
  floorNumber?: number | null;
  qualityScore?: number | null;
  isAiGenerated?: boolean;
};

/** One panorama per room label — avoids duplicate Pannellum scene ids. */
export function pickPanoramaRoomsForViewer(rooms: RoomLike[]): ViewerPanoramaRoom[] {
  const ready = rooms.filter(
    (p) =>
      p.panoramaStatus === "ready" &&
      typeof p.panoramaUrl === "string" &&
      p.panoramaUrl.length > 0,
  );

  const byLabel = new Map<string, RoomLike>();
  for (const p of ready) {
    const label = (p.roomType ?? p.roomLabel ?? "Room").trim();
    const key = label.toLowerCase();
    const prev = byLabel.get(key);
    if (!prev || (p.qualityScore ?? 0) > (prev.qualityScore ?? 0)) {
      byLabel.set(key, p);
    }
  }

  return Array.from(byLabel.values())
    .sort(
      (a, b) =>
        roomNavRank(a.roomType ?? a.roomLabel ?? "") -
        roomNavRank(b.roomType ?? b.roomLabel ?? ""),
    )
    .map((p, i) => ({
      sceneId: p.id ? `scene-${p.id}` : `scene-${i}`,
      roomType: p.roomType ?? p.roomLabel ?? "Room",
      panoramaUrl: p.panoramaUrl!,
      sourceImageUrl: p.thumbnailUrl ?? p.panoramaUrl,
      isAiGenerated: p.isAiGenerated ?? false,
      floorNumber: p.floorNumber ?? i + 1,
    }));
}

/** URL to load in the 360° viewer (AI equirectangular when available). */
export function panoramaUrlForViewer(room: ViewerPanoramaRoom): string {
  if (room.isAiGenerated && room.panoramaUrl) return room.panoramaUrl;
  if (room.panoramaUrl.includes("/panoramas/")) return room.panoramaUrl;
  return room.panoramaUrl;
}

export function hasAiPanorama(room: ViewerPanoramaRoom): boolean {
  const url = room.panoramaUrl;
  if (
    url.includes("muscache.com") ||
    url.includes("airbnb-platform-assets") ||
    url.includes("zillow")
  ) {
    return false;
  }
  return (
    room.isAiGenerated === true ||
    url.includes("/panoramas/") ||
    url.includes("tour-images/panoramas")
  );
}
