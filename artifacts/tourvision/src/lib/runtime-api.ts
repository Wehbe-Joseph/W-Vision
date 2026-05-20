import { resolveApiBaseUrl } from "./resolve-api-base";

const apiBase = resolveApiBaseUrl();

export function getApiUrl(path: string): string {
  if (!path.startsWith("/")) return path;
  return apiBase ? `${apiBase}${path}` : path;
}
