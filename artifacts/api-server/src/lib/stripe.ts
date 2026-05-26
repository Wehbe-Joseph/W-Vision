import Stripe from "stripe";
import { logger } from "./logger";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || key.includes("your_key")) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return stripeClient;
}

export function getStripeWebhookSecret(): string | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

export function stripeConfigured(): boolean {
  return getStripe() !== null;
}

export function logStripeMisconfig(): void {
  if (!stripeConfigured()) {
    logger.warn("STRIPE_SECRET_KEY not set — checkout disabled");
  }
}
