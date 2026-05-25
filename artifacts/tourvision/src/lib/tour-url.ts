/** Public tour viewer path for a share token (respects Vite `BASE_PATH`). */
export function getTourPath(shareToken: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/tour/${encodeURIComponent(shareToken)}`;
}

/** Absolute URL to open the 3D tour viewer. */
export function getTourPageUrl(shareToken: string): string {
  return new URL(getTourPath(shareToken), window.location.origin).href;
}
