import { Resend } from "resend";
import { db } from "@workspace/db";
import { toursTable, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { resolvePublicApiBaseUrl } from "./resolvePublicApiBaseUrl";

function tourPublicOrigin(): string {
  const explicit = process.env.TOURVISION_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return resolvePublicApiBaseUrl().replace(/\/$/, "");
}

export async function notifyAgentTourReady(tourId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn({ tourId }, "RESEND_API_KEY missing — skip tour-ready email");
    return;
  }

  let tour;
  let profile;
  try {
    tour = await db.query.toursTable.findFirst({
      where: eq(toursTable.id, tourId),
    });
    if (!tour) return;
    profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.id, tour.userId),
    });
  } catch (err) {
    logger.warn({ err, tourId }, "Could not load tour for email");
    return;
  }

  const to = profile?.email?.trim();
  if (!to) return;

  const shareUrl = `${tourPublicOrigin()}/tour/${tour.shareToken}`;
  const address = tour.listingAddress ?? tour.listingUrl;

  const resend = new Resend(apiKey);
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ?? "onboarding@resend.dev";

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Your WVision tour is ready — ${address}`,
    html: `
      <p>Your virtual tour is ready to share.</p>
      <p><strong>${address}</strong></p>
      <p><a href="${shareUrl}">Open tour</a></p>
      <p style="color:#666;font-size:13px;">Share link: ${shareUrl}</p>
    `,
  });

  if (error) {
    logger.warn({ err: error, tourId }, "Tour-ready email failed");
    return;
  }

  try {
    await db
      .update(toursTable)
      .set({ emailSent: true })
      .where(eq(toursTable.id, tourId));
  } catch {
    /* non-fatal */
  }

  logger.info({ tourId, to }, "Tour-ready email sent");
}
