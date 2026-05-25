import { pgTable, text, integer, boolean, timestamp, uuid, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const toursTable = pgTable("tours", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
  listingUrl: text("listing_url").notNull(),
  listingTitle: text("listing_title"),
  listingAddress: text("listing_address"),
  listingPlatform: text("listing_platform"),
  listingPrice: text("listing_price"),
  listingBedrooms: integer("listing_bedrooms"),
  listingBathrooms: integer("listing_bathrooms"),
  listingSqft: text("listing_sqft"),
  status: text("status").notNull().default("pending"),
  currentStage: text("current_stage"),
  totalPhotosExtracted: integer("total_photos_extracted").notNull().default(0),
  photosUsed: integer("photos_used").notNull().default(0),
  roomsDetected: integer("rooms_detected").notNull().default(0),
  floorCount: integer("floor_count"),
  confidenceScore: real("confidence_score").notNull().default(0),
  realAngles: integer("real_angles").notNull().default(0),
  aiHighAngles: integer("ai_high_angles").notNull().default(0),
  aiLowAngles: integer("ai_low_angles").notNull().default(0),
  marbleWorldIds: jsonb("marble_world_ids"),
  /** Per-room generation jobs — survives api-server restart. */
  generationScenes: jsonb("generation_scenes"),
  panoramaStatus: text("panorama_status").notNull().default("pending"),
  roomsReady: integer("rooms_ready").notNull().default(0),
  tourType: text("tour_type").notNull().default("panorama"),
  isFullHouse: boolean("is_full_house").notNull().default(false),
  tourEmbedUrl: text("tour_embed_url"),
  shareToken: text("share_token").unique(),
  isWatermarked: boolean("is_watermarked").notNull().default(true),
  thumbnailUrl: text("thumbnail_url"),
  viewCount: integer("view_count").notNull().default(0),
  errorMessage: text("error_message"),
  processingStartedAt: timestamp("processing_started_at"),
  processingCompletedAt: timestamp("processing_completed_at"),
  emailSent: boolean("email_sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  generationStatus: text("generation_status").notNull().default("queued"),
  worldlabsJobId: text("worldlabs_job_id"),
  generatedTourUrl: text("generated_tour_url"),
  previewImageUrl: text("preview_image_url"),
  generationRetries: integer("generation_retries").notNull().default(0),
});

export const insertTourSchema = createInsertSchema(toursTable).omit({ id: true, createdAt: true });
export type InsertTour = z.infer<typeof insertTourSchema>;
export type Tour = typeof toursTable.$inferSelect;
