import { pgTable, text, integer, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profilesTable = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  replitUserId: text("replit_user_id").notNull().unique(),
  fullName: text("full_name").notNull().default(""),
  email: text("email").notNull().default(""),
  avatarUrl: text("avatar_url"),
  accountType: text("account_type").notNull().default("agent"),
  country: text("country"),
  whatsappNumber: text("whatsapp_number"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  subscriptionStatus: text("subscription_status"),
  toursThisMonth: integer("tours_this_month").notNull().default(0),
  totalTours: integer("total_tours").notNull().default(0),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
