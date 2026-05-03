import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { toursTable } from "./tours";

export const angleFlagsTable = pgTable("angle_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  tourId: uuid("tour_id").notNull().references(() => toursTable.id, { onDelete: "cascade" }),
  angleId: text("angle_id").notNull(),
  viewerIp: text("viewer_ip"),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAngleFlagSchema = createInsertSchema(angleFlagsTable).omit({ id: true, createdAt: true });
export type InsertAngleFlag = z.infer<typeof insertAngleFlagSchema>;
export type AngleFlag = typeof angleFlagsTable.$inferSelect;
