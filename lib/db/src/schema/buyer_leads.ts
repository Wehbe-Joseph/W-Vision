import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { toursTable } from "./tours";
import { profilesTable } from "./profiles";

export const buyerLeadsTable = pgTable("buyer_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  tourId: uuid("tour_id").notNull().references(() => toursTable.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => profilesTable.id, { onDelete: "set null" }),
  buyerName: text("buyer_name").notNull(),
  buyerEmail: text("buyer_email").notNull(),
  buyerPhone: text("buyer_phone"),
  message: text("message"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBuyerLeadSchema = createInsertSchema(buyerLeadsTable).omit({ id: true, createdAt: true });
export type InsertBuyerLead = z.infer<typeof insertBuyerLeadSchema>;
export type BuyerLead = typeof buyerLeadsTable.$inferSelect;
