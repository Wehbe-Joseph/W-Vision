/** Match server-side junk URL filter for preview before generate. */
export function isJunkListingImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u.startsWith("http")) return true;
  if (/airbnb-platform-assets|platform-assets|search-bar-icons/i.test(u)) {
    return true;
  }
  if (u.includes("muscache.com") && !u.includes("/im/pictures/")) return true;
  if (/\/icons?\/|\/logo|\/avatar|\/badge|amenity/i.test(u)) return true;
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
