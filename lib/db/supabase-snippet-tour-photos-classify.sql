-- Classification fields for tour_photos (run once)

ALTER TABLE tour_photos ADD COLUMN IF NOT EXISTS room_type text;
ALTER TABLE tour_photos ADD COLUMN IF NOT EXISTS wow_factor integer;
ALTER TABLE tour_photos ADD COLUMN IF NOT EXISTS combined_score real;
ALTER TABLE tour_photos ADD COLUMN IF NOT EXISTS is_property_photo boolean DEFAULT true;
