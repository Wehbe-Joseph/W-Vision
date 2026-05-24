/** Production Vercel deployment — used as docs default and VERCEL_URL fallback hint. */
export const PRODUCTION_SITE_URL = "https://w-vision-tourvision-iauj.vercel.app";

function isLocalhostUrl(value: string): boolean {
  return /localhost|127\.0\.0\.1|:8080\b|:18992\b/i.test(value);
}

/**
 * Public origin for uploaded image URLs and in-memory image fallbacks.
 *
 * Priority:
 * 1. PUBLIC_API_BASE_URL (when not localhost)
 * 2. https://$VERCEL_URL on Vercel
 * 3. http://localhost:8080 in local development only
 */
export function resolvePublicApiBaseUrl(): string {
  const configured = (process.env.PUBLIC_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (configured && !isLocalhostUrl(configured)) {
    return configured;
  }

  const vercelHost = (process.env.VERCEL_URL ?? "").trim();
  if (process.env.VERCEL === "1" && vercelHost) {
    return `https://${vercelHost.replace(/\/+$/, "")}`;
  }

  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_SITE_URL;
  }

  return "http://localhost:8080";
}

export function isPublicApiBaseConfigured(): boolean {
  const configured = (process.env.PUBLIC_API_BASE_URL ?? "").trim();
  if (configured && !isLocalhostUrl(configured)) return true;
  if (process.env.VERCEL === "1" && process.env.VERCEL_URL) return true;
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

export function getConfiguredPublicApiBaseForDiagnostics(): string | null {
  const resolved = resolvePublicApiBaseUrl();
  if (isLocalhostUrl(resolved) && process.env.NODE_ENV === "production") {
    return null;
  }
  return resolved;
}
