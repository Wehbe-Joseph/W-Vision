import { pgTable, text, integer, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { toursTable } from "./tours";

export const tourViewsTable = pgTable("tour_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  tourId: uuid("tour_id").notNull().references(() => toursTable.id, { onDelete: "cascade" }),
  viewerIp: text("viewer_ip"),
  country: text("country"),
  deviceType: text("device_type"),
  browser: text("browser"),
  timeSpentSeconds: integer("time_spent_seconds"),
  roomsVisited: jsonb("rooms_visited"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTourViewSchema = createInsertSchema(tourViewsTable).omit({ id: true, createdAt: true });
export type InsertTourView = z.infer<typeof insertTourViewSchema>;
export type TourView = typeof tourViewsTable.$inferSelect;
