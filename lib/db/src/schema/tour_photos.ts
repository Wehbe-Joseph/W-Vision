import { pgTable, text, integer, boolean, timestamp, uuid, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { toursTable } from "./tours";

export const tourPhotosTable = pgTable("tour_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tourId: uuid("tour_id").notNull().references(() => toursTable.id, { onDelete: "cascade" }),
  originalUrl: text("original_url"),
  storagePath: text("storage_path"),
  roomLabel: text("room_label").notNull().default("Room"),
  floorNumber: integer("floor_number"),
  qualityScore: integer("quality_score").notNull().default(3),
  isSelected: boolean("is_selected").notNull().default(true),
  isBestForRoom: boolean("is_best_for_room").notNull().default(false),
  isAiGenerated: boolean("is_ai_generated").notNull().default(false),
  confidenceScore: real("confidence_score"),
  angleDegrees: integer("angle_degrees"),
  marbleWorldId: text("marble_world_id"),
  marbleEmbedUrl: text("marble_embed_url"),
  /** Public HTTPS URL to the mirrored .spz in Supabase Storage — in-app Spark viewer. */
  worldEmbedUrl: text("world_embed_url"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTourPhotoSchema = createInsertSchema(tourPhotosTable).omit({ id: true, createdAt: true });
export type InsertTourPhoto = z.infer<typeof insertTourPhotoSchema>;
export type TourPhoto = typeof tourPhotosTable.$inferSelect;
