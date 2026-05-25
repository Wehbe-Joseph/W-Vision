-- Panorama pipeline columns (run once on Supabase SQL editor or via drizzle-kit push)

ALTER TABLE tour_photos ADD COLUMN IF NOT EXISTS panorama_url text;
ALTER TABLE tour_photos ADD COLUMN IF NOT EXISTS panorama_status text DEFAULT 'pending';

ALTER TABLE tours ADD COLUMN IF NOT EXISTS panorama_status text DEFAULT 'pending';
ALTER TABLE tours ADD COLUMN IF NOT EXISTS rooms_ready integer DEFAULT 0;
ALTER TABLE tours ADD COLUMN IF NOT EXISTS tour_type text DEFAULT 'panorama';
ALTER TABLE tours ADD COLUMN IF NOT EXISTS is_full_house boolean DEFAULT false;
