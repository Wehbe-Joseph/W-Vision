-- Run once in Supabase SQL editor (or your migration runner).
ALTER TABLE tour_photos ADD COLUMN IF NOT EXISTS world_embed_url text;
