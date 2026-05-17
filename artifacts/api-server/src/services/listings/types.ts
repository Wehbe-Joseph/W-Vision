/**
 * Shared types for listing scrapers (Airbnb, Booking.com, Zillow, ...).
 *
 * Every scraper normalizes its actor's raw output into this shape so the
 * `/api/scrape-listing` endpoint always returns the same JSON regardless of
 * which platform the URL came from.
 */

export type ListingPlatform =
  | "airbnb"
  | "booking"
  | "zillow"
  | "manual"
  | "unknown";

export interface ListingImage {
  url: string;
  /** Human-readable caption (e.g. "Living room") when the actor returns one. */
  caption?: string | null;
  /** Room category if the actor groups photos (e.g. "Bedroom"). */
  room?: string | null;
}

export interface ListingMetadata {
  bedrooms?: number | null;
  bathrooms?: number | null;
  guests?: number | null;
  beds?: number | null;
  propertyType?: string | null;
  /** Free-form raw fields the platform exposes (price, location, host…). */
  extras?: Record<string, unknown>;
}

export interface ListingData {
  platform: ListingPlatform;
  /** Canonical listing URL we scraped (echoed for the client). */
  url: string;
  title: string | null;
  description: string | null;
  /** Up to ~50 photos pulled from the actor's dataset. */
  images: ListingImage[];
  /** Room/category labels collected from the image list, de-duplicated. */
  rooms: string[];
  metadata: ListingMetadata;
  /** Wall-clock duration of the actor run, useful for diagnostics. */
  scrapedAtMs: number;
  durationMs: number;
}

export class ListingScrapeError extends Error {
  readonly code:
    | "INVALID_URL"
    | "UNSUPPORTED_PLATFORM"
    | "ACTOR_FAILED"
    | "ACTOR_TIMEOUT"
    | "NO_RESULTS"
    | "CONFIG_MISSING";
  readonly status: number;

  constructor(
    code: ListingScrapeError["code"],
    message: string,
    status = 500,
  ) {
    super(message);
    this.name = "ListingScrapeError";
    this.code = code;
    this.status = status;
  }
}
