import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const onboardingAnswersTable = pgTable("onboarding_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  useCase: text("use_case").notNull(),
  referralSource: text("referral_source").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OnboardingAnswer = typeof onboardingAnswersTable.$inferSelect;
export type InsertOnboardingAnswer = typeof onboardingAnswersTable.$inferInsert;
