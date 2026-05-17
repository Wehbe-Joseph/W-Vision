import { getAirbnbListingData, isAirbnbUrl } from "./airbnb";
import {
  type ListingData,
  type ListingPlatform,
  ListingScrapeError,
} from "./types";

export { getAirbnbListingData, isAirbnbUrl } from "./airbnb";
export type {
  ListingData,
  ListingImage,
  ListingMetadata,
  ListingPlatform,
} from "./types";
export { ListingScrapeError } from "./types";

export function detectPlatform(rawUrl: string): ListingPlatform {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "unknown";
  }
  const host = parsed.hostname.toLowerCase();

  if (/(^|\.)airbnb\.[a-z.]+$/.test(host)) return "airbnb";
  if (/(^|\.)booking\.com$/.test(host)) return "booking";
  if (/(^|\.)zillow\.com$/.test(host)) return "zillow";

  return "unknown";
}

/**
 * Single entrypoint for the scrape-listing endpoint. Dispatches to the right
 * platform scraper based on the URL. Throws ListingScrapeError on validation
 * or platform-not-supported.
 */
export async function getListingData(rawUrl: string): Promise<ListingData> {
  const url = rawUrl.trim();
  if (!url) {
    throw new ListingScrapeError("INVALID_URL", "URL is required", 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ListingScrapeError(
      "INVALID_URL",
      "URL must be a valid http(s) URL",
      400,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ListingScrapeError(
      "INVALID_URL",
      "URL must use http or https",
      400,
    );
  }

  const platform = detectPlatform(url);
  switch (platform) {
    case "airbnb":
      return getAirbnbListingData(url);
    case "booking":
    case "zillow":
      throw new ListingScrapeError(
        "UNSUPPORTED_PLATFORM",
        `${platform} scraping is not implemented yet`,
        501,
      );
    default:
      throw new ListingScrapeError(
        "UNSUPPORTED_PLATFORM",
        "URL is not a supported listing platform (Airbnb, Booking.com, Zillow)",
        400,
      );
  }
}

// Convenience: ensure isAirbnbUrl is reachable for unit tests, etc.
export const _internal = { isAirbnbUrl };
