import type { RoomType } from "../services/imageClassifier/gemini";

/** Viewer navigation order (hotspot chain). */
export const ROOM_NAV_ORDER: RoomType[] = [
  "Living Room",
  "Dining Room",
  "Kitchen",
  "Master Bedroom",
  "Bedroom",
  "Bathroom",
  "Balcony",
  "Garden",
  "Garage",
  "Exterior",
  "Hallway",
  "Other",
];

const NAV_RANK = new Map(ROOM_NAV_ORDER.map((r, i) => [r, i]));

export function roomNavRank(roomType: string): number {
  return NAV_RANK.get(roomType as RoomType) ?? 999;
}

export function sortRoomTypes<T extends { roomType: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => roomNavRank(a.roomType) - roomNavRank(b.roomType));
}
