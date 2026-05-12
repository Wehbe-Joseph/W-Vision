import { Router } from "express";
import { db } from "@workspace/db";
import { profilesTable, onboardingAnswersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  UpdateUserProfileBody,
  CompleteOnboardingBody,
} from "@workspace/api-zod";
import {
  memTourCountThisMonthForUser,
  memTotalToursForUser,
  unfreezeAllToursForUser,
} from "../lib/tourMemoryStore";
import {
  getMemUser,
  setMemUserTier,
  type SubscriptionTier,
} from "../lib/userMemoryStore";

const router = Router();

const TOUR_LIMITS: Record<string, number> = {
  free: 1,
  pro: 15,
  unlimited: 30,
};

router.get("/user/profile", async (req, res) => {
  const userId =
    (req.user as { profileId?: string } | undefined)?.profileId ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    let profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, userId),
    });

    if (!profile) {
      const [created] = await db
        .insert(profilesTable)
        .values({
          id: userId,
          replitUserId: userId,
          fullName: (req.headers["x-user-name"] as string) || "User",
          email: (req.headers["x-user-email"] as string) || "",
        })
        .returning();
      profile = created;
    }

    return res.json({
      id: profile.id,
      fullName: profile.fullName,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
      accountType: profile.accountType,
      country: profile.country,
      whatsappNumber: profile.whatsappNumber,
      subscriptionTier: profile.subscriptionTier,
      subscriptionStatus: profile.subscriptionStatus,
      toursThisMonth: Math.max(
        profile.toursThisMonth ?? 0,
        memTourCountThisMonthForUser(userId),
      ),
      totalTours: Math.max(
        profile.totalTours ?? 0,
        memTotalToursForUser(userId),
      ),
      onboardingCompleted: profile.onboardingCompleted,
      createdAt: profile.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.warn({ err }, "DB profile lookup failed — returning ephemeral profile");
    return res.json({
      id: userId,
      fullName: (req.headers["x-user-name"] as string) || "User",
      email: (req.headers["x-user-email"] as string) || "",
      avatarUrl: null,
      accountType: null,
      country: null,
      whatsappNumber: null,
      subscriptionTier: "free",
      subscriptionStatus: "active",
      toursThisMonth: memTourCountThisMonthForUser(userId),
      totalTours: memTotalToursForUser(userId),
      onboardingCompleted: true,
      createdAt: new Date().toISOString(),
    });
  }
});

router.put("/user/profile", async (req, res) => {
  try {
    const userId = (req.user as { profileId?: string } | undefined)?.profileId ?? (req.headers["x-user-id"] as string | undefined);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = UpdateUserProfileBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const [updated] = await db
      .update(profilesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(profilesTable.id, userId))
      .returning();

    if (!updated) return res.status(404).json({ error: "Profile not found" });

    return res.json({
      id: updated.id,
      fullName: updated.fullName,
      email: updated.email,
      avatarUrl: updated.avatarUrl,
      accountType: updated.accountType,
      country: updated.country,
      whatsappNumber: updated.whatsappNumber,
      subscriptionTier: updated.subscriptionTier,
      subscriptionStatus: updated.subscriptionStatus,
      toursThisMonth: updated.toursThisMonth,
      totalTours: updated.totalTours,
      onboardingCompleted: updated.onboardingCompleted,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/user/limits", async (req, res) => {
  const userId =
    (req.user as { profileId?: string } | undefined)?.profileId ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  let tier: SubscriptionTier = "free";
  let profileToursThisMonth: number | null = null;

  try {
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, userId),
    });
    if (profile) {
      tier = (profile.subscriptionTier as SubscriptionTier) || "free";
      profileToursThisMonth = profile.toursThisMonth ?? 0;
    } else {
      tier = getMemUser(userId).tier;
    }
  } catch (err) {
    req.log.warn({ err }, "DB limits lookup failed — using in-memory fallback");
    tier = getMemUser(userId).tier;
  }

  const memCount = memTourCountThisMonthForUser(userId);
  const toursThisMonth = Math.max(profileToursThisMonth ?? 0, memCount);
  const limit = TOUR_LIMITS[tier] ?? 1;

  return res.json({
    tier,
    toursThisMonth,
    toursLimit: limit,
    toursRemaining: Math.max(0, limit - toursThisMonth),
    renewalDate: null,
  });
});

router.get("/user/onboarding-status", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.json({ completed: false });
    }
    const answer = await db.query.onboardingAnswersTable.findFirst({
      where: eq(onboardingAnswersTable.userId, req.user.id),
    });
    return res.json({ completed: !!answer });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/user/onboarding", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { useCase, referralSource } = req.body as {
      useCase?: string;
      referralSource?: string;
    };

    if (!useCase || !referralSource) {
      return res.status(400).json({ error: "useCase and referralSource are required" });
    }

    // Upsert onboarding answers linked to the real auth user
    const existing = await db.query.onboardingAnswersTable.findFirst({
      where: eq(onboardingAnswersTable.userId, req.user.id),
    });

    if (existing) {
      await db
        .update(onboardingAnswersTable)
        .set({ useCase, referralSource })
        .where(eq(onboardingAnswersTable.userId, req.user.id));
    } else {
      await db.insert(onboardingAnswersTable).values({
        userId: req.user.id,
        useCase,
        referralSource,
      });
    }

    // Also mark the profile as onboarding-completed if profile exists
    try {
      await db
        .update(profilesTable)
        .set({ onboardingCompleted: true, updatedAt: new Date() })
        .where(eq(profilesTable.id, (req.user as { profileId?: string }).profileId ?? req.user.id));
    } catch {
      // Profile may not exist yet — that's fine
    }

    return res.json({ success: true, message: "Onboarding completed" });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/subscribe", async (req, res) => {
  const userId =
    (req.user as { profileId?: string } | undefined)?.profileId ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const tier = (req.body?.tier as SubscriptionTier | undefined) ?? "pro";
  if (!["free", "pro", "unlimited"].includes(tier)) {
    return res.status(400).json({ error: "Invalid tier" });
  }

  // Try to persist in DB (best-effort) and ALWAYS update memory.
  try {
    await db
      .update(profilesTable)
      .set({
        subscriptionTier: tier,
        subscriptionStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(profilesTable.id, userId));
  } catch (err) {
    req.log.warn(
      { err, userId, tier },
      "DB subscription update failed — using memory store",
    );
  }
  setMemUserTier(userId, tier);

  // Unfreeze every tour the user owns when they switch to a paid plan.
  const unfrozen = tier === "free" ? 0 : unfreezeAllToursForUser(userId);

  return res.json({
    success: true,
    message:
      tier === "free"
        ? "Subscription set to free"
        : `Upgraded to ${tier} — unfroze ${unfrozen} tour${unfrozen === 1 ? "" : "s"}`,
    tier,
    unfrozen,
  });
});

// Convenience endpoint: unfreeze a single tour (used by the upgrade CTA on
// the viewer page). Only works for paid plans.
router.post("/tours/:tourId/unfreeze", async (req, res) => {
  const userId =
    (req.user as { profileId?: string } | undefined)?.profileId ??
    (req.headers["x-user-id"] as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const profile = getMemUser(userId);
  if (profile.tier === "free") {
    return res.status(402).json({
      error: "Upgrade required",
      code: "PAYMENT_REQUIRED",
      message: "Upgrade to Pro or Unlimited to keep this tour live.",
    });
  }

  const unfrozen = unfreezeAllToursForUser(userId);
  return res.json({ success: true, unfrozen });
});

export default router;
