import type { MemTour } from "./tourMemoryStore";
import { FREE_TIER_TTL_MS } from "./userMemoryStore";

export const FULL_HOUSE_UNLOCK_USD = 29;
export const FULL_HOUSE_UNLOCK_CENTS = 2900;

export type SubscriptionTier = "free" | "pro" | "unlimited";

export function isPaidSubscriptionTier(tier: string): boolean {
  return tier === "pro" || tier === "unlimited";
}

/** Free preview: one AI room until the tour is unlocked or user has a paid plan. */
export function shouldLimitToOneRoom(tour: Pick<
  MemTour,
  "createdOnTier" | "fullHouseUnlocked"
>): boolean {
  return tour.createdOnTier === "free" && !tour.fullHouseUnlocked;
}

export function freeTierExpiresAtMs(): number {
  return Date.now() + FREE_TIER_TTL_MS;
}

export function freeTierExpiresAtDate(): Date {
  return new Date(freeTierExpiresAtMs());
}
