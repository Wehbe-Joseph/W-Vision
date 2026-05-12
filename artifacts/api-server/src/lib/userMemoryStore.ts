/**
 * In-memory user profile state.
 *
 * Mirrors a subset of the `profiles` table for the cases where the DB is
 * unreachable. Mostly used to track the current subscription tier so the
 * generation flow knows whether a tour should expire after 24 hours
 * (free tier) or live indefinitely (paid).
 */

export type SubscriptionTier = "free" | "pro" | "unlimited";

export interface MemUserProfile {
  userId: string;
  tier: SubscriptionTier;
  subscriptionStatus: "active" | "inactive";
  subscriptionStartedAt: number | null;
  updatedAt: number;
}

export const TIER_TOUR_LIMITS: Record<SubscriptionTier, number> = {
  free: 1,
  pro: 15,
  unlimited: 30,
};

/** How long a free-tier tour is viewable before it freezes (ms). */
export const FREE_TIER_TTL_MS = 24 * 60 * 60 * 1000;

const PROFILES = new Map<string, MemUserProfile>();

function defaultProfile(userId: string): MemUserProfile {
  return {
    userId,
    tier: "free",
    subscriptionStatus: "active",
    subscriptionStartedAt: null,
    updatedAt: Date.now(),
  };
}

export function getMemUser(userId: string): MemUserProfile {
  let profile = PROFILES.get(userId);
  if (!profile) {
    profile = defaultProfile(userId);
    PROFILES.set(userId, profile);
  }
  return profile;
}

export function setMemUserTier(
  userId: string,
  tier: SubscriptionTier,
): MemUserProfile {
  const profile = getMemUser(userId);
  profile.tier = tier;
  profile.subscriptionStatus = "active";
  profile.subscriptionStartedAt =
    tier === "free" ? null : profile.subscriptionStartedAt ?? Date.now();
  profile.updatedAt = Date.now();
  return profile;
}

export function isPaidTier(tier: SubscriptionTier): boolean {
  return tier !== "free";
}
