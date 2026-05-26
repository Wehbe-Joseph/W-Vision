import type { Request, Response } from "express";
import { Router } from "express";
import { db } from "@workspace/db";
import { profilesTable, toursTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireProfileId } from "../lib/resolveProfileId";
import {
  FULL_HOUSE_UNLOCK_CENTS,
  FULL_HOUSE_UNLOCK_USD,
  isPaidSubscriptionTier,
} from "../lib/tourBilling";
import { getStripe, getStripeWebhookSecret, stripeConfigured } from "../lib/stripe";
import { unlockTourFullHouseAndResume } from "../lib/tourUnlock";
import { resolvePublicApiBaseUrl } from "../lib/resolvePublicApiBaseUrl";
import { logger } from "../lib/logger";

const router = Router();

function siteOrigin(): string {
  const tourvision = (process.env.TOURVISION_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  if (tourvision) return tourvision;
  return resolvePublicApiBaseUrl().replace(/\/api$/, "").replace(/\/+$/, "");
}

router.get("/billing/config", (_req, res) => {
  res.json({
    fullHousePriceUsd: FULL_HOUSE_UNLOCK_USD,
    stripeEnabled: stripeConfigured(),
  });
});

router.post("/billing/checkout/full-house", async (req, res) => {
  try {
    const userId = await requireProfileId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const tourId = typeof req.body?.tourId === "string" ? req.body.tourId : "";
    if (!tourId) {
      return res.status(400).json({ error: "tourId is required" });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({
        error: "Payments not configured",
        message: "Add STRIPE_SECRET_KEY on the server.",
      });
    }

    let tour;
    try {
      tour = await db.query.toursTable.findFirst({
        where: eq(toursTable.id, tourId),
      });
    } catch (err) {
      req.log.warn({ err, tourId }, "DB unavailable for checkout");
      return res.status(503).json({ error: "Database unavailable" });
    }

    if (!tour || tour.userId !== userId) {
      return res.status(404).json({ error: "Tour not found" });
    }

    if (tour.fullHouseUnlocked) {
      return res.status(400).json({
        error: "Already unlocked",
        message: "This tour already has full-house access.",
      });
    }

    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, userId),
    });
    if (profile && isPaidSubscriptionTier(profile.subscriptionTier)) {
      return res.status(400).json({
        error: "Already on paid plan",
        message: "Use Resume generation — your subscription includes the full house.",
      });
    }

    const origin = siteOrigin();
    const priceId = process.env.STRIPE_PRICE_FULL_HOUSE_UNLOCK?.trim();

    const lineItems = priceId
      ? [{ price: priceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: "usd",
              unit_amount: FULL_HOUSE_UNLOCK_CENTS,
              product_data: {
                name: "W-Vision — Full house unlock",
                description:
                  "Generate every room in this tour as a 360° panorama.",
              },
            },
            quantity: 1,
          },
        ];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${origin}/dashboard/billing/success?tour_id=${encodeURIComponent(tourId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/new-tour?canceled=1`,
      client_reference_id: tourId,
      metadata: {
        type: "full_house_unlock",
        tourId,
        userId,
      },
    });

    if (!session.url) {
      return res.status(500).json({ error: "Could not create checkout session" });
    }

    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    req.log.error({ err }, "Checkout session failed");
    return res.status(500).json({ error: "Could not start checkout" });
  }
});

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const stripe = getStripe();
  const webhookSecret = getStripeWebhookSecret();

  if (!stripe || !webhookSecret) {
    res.status(503).send("Stripe not configured");
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    res.status(400).send("Missing stripe-signature");
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      signature,
      webhookSecret,
    );
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed");
    res.status(400).send("Invalid signature");
    return;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.metadata?.type === "full_house_unlock") {
        const tourId = session.metadata.tourId;
        const userId = session.metadata.userId;
        if (tourId && userId) {
          await unlockTourFullHouseAndResume(tourId, userId);
          logger.info({ tourId, userId }, "Full house unlocked via Stripe");
        }
      }
    }
  } catch (err) {
    logger.error({ err, type: event.type }, "Stripe webhook handler error");
    res.status(500).send("Webhook handler failed");
    return;
  }

  res.json({ received: true });
}

export default router;
