-- Run once in Supabase SQL editor (or your migration runner).
ALTER TABLE tours ADD COLUMN IF NOT EXISTS generation_scenes jsonb;
