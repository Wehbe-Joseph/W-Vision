/**
 * Production API base URL for browser requests.
 * Prefer same-origin `/api` on Vercel unless a valid external API host is set.
 */
export function resolveApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (!configured) return "";

  const normalized = configured.replace(/\/+$/, "");

  if (!import.meta.env.PROD) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const looksLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local");
    const looksDeadRailwayPlaceholder =
      host.includes("railway.app") &&
      (host.includes("w-vision-api") || host.includes("production.up"));

    if (looksLocal || looksDeadRailwayPlaceholder) {
      return "";
    }
  } catch {
    return "";
  }

  return normalized;
}
