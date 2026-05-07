import { Router } from "express";
import { db } from "@workspace/db";
import { profilesTable, onboardingAnswersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  UpdateUserProfileBody,
  CompleteOnboardingBody,
} from "@workspace/api-zod";

const router = Router();

const TOUR_LIMITS: Record<string, number> = {
  free: 1,
  pro: 15,
  unlimited: 30,
};

router.get("/user/profile", async (req, res) => {
  try {
    const userId = (req.user as { profileId?: string } | undefined)?.profileId ?? (req.headers["x-user-id"] as string | undefined);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    let profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, userId),
    });

    if (!profile) {
      const [created] = await db
        .insert(profilesTable)
        .values({
          id: userId,
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
      toursThisMonth: profile.toursThisMonth,
      totalTours: profile.totalTours,
      onboardingCompleted: profile.onboardingCompleted,
      createdAt: profile.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
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
  try {
    const userId = (req.user as { profileId?: string } | undefined)?.profileId ?? (req.headers["x-user-id"] as string | undefined);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, userId),
    });

    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const tier = profile.subscriptionTier || "free";
    const limit = TOUR_LIMITS[tier] ?? 1;

    return res.json({
      tier,
      toursThisMonth: profile.toursThisMonth,
      toursLimit: limit,
      toursRemaining: Math.max(0, limit - profile.toursThisMonth),
      renewalDate: null,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
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
  return res.json({ success: true, message: "Subscribed successfully" });
});

export default router;
