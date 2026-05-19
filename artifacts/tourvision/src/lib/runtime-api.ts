const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

const apiBase = configuredApiBase ? configuredApiBase.replace(/\/+$/, "") : "";

export function getApiUrl(path: string): string {
  if (!path.startsWith("/")) return path;
  return apiBase ? `${apiBase}${path}` : path;
}
