const ROOM_NAV_ORDER = [
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
] as const;

const NAV_RANK = new Map(ROOM_NAV_ORDER.map((r, i) => [r, i]));

export function roomNavRank(roomType: string): number {
  return NAV_RANK.get(roomType as (typeof ROOM_NAV_ORDER)[number]) ?? 999;
}
