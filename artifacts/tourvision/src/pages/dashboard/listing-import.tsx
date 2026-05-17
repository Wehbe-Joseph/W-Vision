import { useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  Globe2,
  AlertTriangle,
  Download,
  Image as ImageIcon,
  Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface ListingImage {
  url: string;
  caption?: string | null;
  room?: string | null;
}

interface ListingData {
  platform: string;
  url: string;
  title: string | null;
  description: string | null;
  images: ListingImage[];
  rooms: string[];
  metadata: {
    bedrooms?: number | null;
    bathrooms?: number | null;
    guests?: number | null;
    beds?: number | null;
    propertyType?: string | null;
    extras?: Record<string, unknown>;
  };
  scrapedAtMs: number;
  durationMs: number;
}

interface ScrapeResponse {
  success: true;
  platform: string;
  data: ListingData;
}

interface ScrapeErrorResponse {
  error: string;
  code: string;
  platform?: string;
}

export default function ListingImport() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listing, setListing] = useState<ListingData | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setListing(null);
    if (!url.trim()) {
      setError("Please paste a listing URL first.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/scrape-listing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = (await res.json()) as ScrapeResponse | ScrapeErrorResponse;
      if (!res.ok || !("success" in json)) {
        const err = json as ScrapeErrorResponse;
        setError(err.error || `Request failed (${res.status})`);
      } else {
        setListing(json.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative p-6 max-w-7xl mx-auto w-full space-y-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-16 -right-16 h-72 w-72 rounded-full bg-gradient-to-br from-emerald-200/40 to-transparent blur-3xl" />
      </div>

      <header className="relative rounded-3xl border border-zinc-200 bg-white/90 backdrop-blur p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-[#f5f4ef] px-3 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
            Import Listing
          </span>
        </div>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900">
          Pull photos from a listing URL
        </h1>
        <p className="text-zinc-500 max-w-2xl mt-1">
          Paste a public Airbnb listing URL and we'll fetch the photos, room
          labels, and metadata. Booking.com and Zillow coming next.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="relative rounded-2xl border border-zinc-200 bg-white p-5 flex flex-col md:flex-row gap-3 shadow-[0_14px_30px_-18px_rgba(0,0,0,0.45)]"
      >
        <div className="relative flex-1">
          <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.airbnb.com/rooms/12345678"
            className="pl-9 h-12 rounded-xl border border-zinc-300 bg-[#faf9f5] text-sm"
            disabled={loading}
          />
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="h-12 px-6 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 font-semibold uppercase tracking-wider"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" /> Import Listing
            </>
          )}
        </Button>
      </form>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-destructive bg-destructive/5 text-destructive px-4 py-3 flex items-start gap-3"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="text-sm font-mono">{error}</div>
        </motion.div>
      )}

      {loading && <LoadingState />}

      {listing && <ListingResult listing={listing} />}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-2/3 rounded-xl" />
      <Skeleton className="h-4 w-1/3 rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ListingResult({ listing }: { listing: ListingData }) {
  const meta = listing.metadata;
  const stats = [
    { label: "Photos", value: listing.images.length },
    { label: "Rooms", value: listing.rooms.length || "—" },
    meta.bedrooms != null && { label: "Bedrooms", value: meta.bedrooms },
    meta.bathrooms != null && { label: "Bathrooms", value: meta.bathrooms },
    meta.guests != null && { label: "Guests", value: meta.guests },
    {
      label: "Scraped in",
      value: `${(listing.durationMs / 1000).toFixed(1)}s`,
    },
  ].filter(Boolean) as { label: string; value: string | number }[];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3 shadow-[0_14px_30px_-18px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {listing.platform}
        </div>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
          {listing.title ?? "Untitled listing"}
        </h2>
        {listing.description && (
          <p className="text-sm text-zinc-500 line-clamp-3 max-w-3xl">
            {listing.description}
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-zinc-200 px-3 py-2 flex flex-col bg-[#faf9f5]"
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                {s.label}
              </span>
              <span className="font-semibold text-lg text-zinc-900">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {listing.rooms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {listing.rooms.map((room) => (
            <span
              key={room}
              className="px-3 py-1.5 rounded-full border border-zinc-200 text-xs font-semibold uppercase tracking-widest bg-white"
            >
              {room}
            </span>
          ))}
        </div>
      )}

      {listing.images.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 font-mono uppercase tracking-widest bg-white">
          No photos returned for this listing
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 [perspective:1000px]">
          {listing.images.map((img, i) => (
            <motion.a
              key={`${img.url}-${i}`}
              href={img.url}
              target="_blank"
              rel="noreferrer"
              whileHover={{ y: -4, rotateX: 2, rotateY: i % 2 === 0 ? -2 : 2 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="group block rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-[0_10px_20px_-16px_rgba(0,0,0,0.5)]"
            >
              <div className="aspect-[4/3] overflow-hidden bg-accent">
                <img
                  src={img.url}
                  alt={img.caption ?? img.room ?? `Listing photo ${i + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                />
              </div>
              {(img.room || img.caption) && (
                <div className="px-3 py-2 border-t border-zinc-200 text-xs font-semibold uppercase tracking-wider truncate">
                  {img.room ?? img.caption}
                </div>
              )}
              <div className="pointer-events-none absolute top-2 right-2 rounded-lg bg-black/55 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <ImageIcon className="w-3 h-3" />
              </div>
              <div className="pointer-events-none absolute bottom-2 right-2 rounded-lg bg-black/55 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Clock3 className="w-3 h-3" />
              </div>
            </motion.a>
          ))}
        </div>
      )}
    </motion.div>
  );
}
