-- Run in Supabase SQL editor (safe to re-run with IF NOT EXISTS patterns).

ALTER TABLE tours ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE tours ADD COLUMN IF NOT EXISTS frozen boolean NOT NULL DEFAULT false;
ALTER TABLE tours ADD COLUMN IF NOT EXISTS created_on_tier text NOT NULL DEFAULT 'free';
ALTER TABLE tours ADD COLUMN IF NOT EXISTS full_house_unlocked boolean NOT NULL DEFAULT false;
