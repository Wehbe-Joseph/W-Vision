/** Canonical production site (custom domain on Vercel). */
export const PRODUCTION_SITE_URL = "https://getwvision.com";

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local")
  );
}

/**
 * Public site origin for OAuth redirects and share links.
 * Set `VITE_SITE_URL=https://getwvision.com` on Vercel (Production).
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

/**
 * Redirect www → apex for a single canonical host.
 *
 * **Never** redirect while Google / Supabase OAuth is completing: the PKCE
 * code verifier lives in this origin's storage. Sending `?code=...` to the
 * apex host would lose the verifier (www and apex do not share localStorage).
 */
export function redirectToCanonicalHost(): void {
  if (typeof window === "undefined" || !import.meta.env.PROD) return;
  const host = window.location.hostname.toLowerCase();
  if (host !== "www.getwvision.com") return;

  const path = window.location.pathname;
  const search = window.location.search;
  const hash = window.location.hash;

  if (path.startsWith("/auth/callback")) return;
  if (search.includes("code=") || search.includes("error=")) return;
  if (hash.includes("access_token") || hash.includes("error=")) return;

  const dest = `https://getwvision.com${path}${search}${hash}`;
  window.location.replace(dest);
}
