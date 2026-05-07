import { randomBytes } from "crypto";

interface StoredImage {
  data: Buffer;
  mimeType: string;
  expires: number;
}

const store = new Map<string, StoredImage>();
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — plenty of time for WorldLabs to fetch

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (val.expires < now) store.delete(key);
  }
}, 10 * 60 * 1000);
cleanup.unref();

export function storeImage(data: Buffer, mimeType: string): string {
  const id = randomBytes(16).toString("hex");
  store.set(id, { data, mimeType, expires: Date.now() + TTL_MS });
  return id;
}

export function getImage(id: string): StoredImage | undefined {
  const item = store.get(id);
  if (!item) return undefined;
  if (item.expires < Date.now()) {
    store.delete(id);
    return undefined;
  }
  return item;
}

export function getPublicBaseUrl(req: { headers: Record<string, string | string[] | undefined>; get: (h: string) => string | undefined }): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const firstDomain = domains.split(",")[0].trim();
    return `https://${firstDomain}`;
  }
  const proto = req.get("x-forwarded-proto") ?? "https";
  const host = req.get("host") ?? "localhost";
  return `${proto}://${host}`;
}
