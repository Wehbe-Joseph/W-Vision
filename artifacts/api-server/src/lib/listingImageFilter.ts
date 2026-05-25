/**
 * Heuristics to drop Airbnb UI assets, amenity icons, and other non-room photos
 * before classification / panorama generation.
 */

const JUNK_URL_PATTERNS = [
  /airbnb-platform-assets/i,
  /platform-assets/i,
  /search-bar-icons/i,
  /\/icons?\//i,
  /\/logo/i,
  /\/avatar/i,
  /\/badge/i,
  /\/emoji/i,
  /\/category[_-]?icon/i,
  /host_profile/i,
  /user-avatar/i,
  /amenity[_-]?icon/i,
  /superhost/i,
  /guidebook/i,
  /floor[_-]?plan/i,
  /map[_-]?pin/i,
];

/** Room types we build 360° scenes for (real interior spaces). */
export const PANORAMA_ROOM_TYPES = new Set([
  "Living Room",
  "Kitchen",
  "Master Bedroom",
  "Bedroom",
  "Bathroom",
  "Dining Room",
  "Balcony",
  "Hallway",
]);

export function isJunkListingImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u.startsWith("http")) return true;
  if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(u)) return true;
  for (const re of JUNK_URL_PATTERNS) {
    if (re.test(u)) return true;
  }
  // Airbnb listing photos live under /im/pictures/ — other muscache paths are often UI.
  if (u.includes("muscache.com") && !u.includes("/im/pictures/")) {
    return true;
  }
  return false;
}

export function filterListingImageUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = raw.replace(/\?.*$/, "").trim();
    if (!url || isJunkListingImageUrl(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function isPanoramaEligibleRoomType(roomType: string): boolean {
  return PANORAMA_ROOM_TYPES.has(roomType);
}
