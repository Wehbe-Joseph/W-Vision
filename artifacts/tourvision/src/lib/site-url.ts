/** Canonical production site (matches Vercel: apex redirects to www). */
export const PRODUCTION_SITE_URL = "https://www.getwvision.com";

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local")
  );
}

/**
 * Public site origin for OAuth redirects and share links.
 * Set `VITE_SITE_URL=https://www.getwvision.com` on Vercel (Production).
 */
export function getPublicSiteUrl(): string {
  const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    try {
      const { origin, hostname } = window.location;
      if (!import.meta.env.PROD || !isLocalHost(hostname)) {
        return origin.replace(/\/+$/, "");
      }
    } catch {
      /* fall through */
    }
  }

  if (import.meta.env.PROD) {
    return PRODUCTION_SITE_URL;
  }

  return typeof window !== "undefined"
    ? window.location.origin.replace(/\/+$/, "")
    : PRODUCTION_SITE_URL;
}

/**
 * OAuth return URL — must match the origin where sign-in started (PKCE verifier).
 * Always use the current browser origin, not a hard-coded env URL.
 */
export function getAuthCallbackUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin.replace(/\/+$/, "")}/auth/callback`;
  }
  return `${getPublicSiteUrl()}/auth/callback`;
}
