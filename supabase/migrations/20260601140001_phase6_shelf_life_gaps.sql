-- Phase 6: Shelf Life & Stability gaps
-- G-46: Study type + ASLT temperature conditions
ALTER TABLE shelf_life_studies
  ADD COLUMN IF NOT EXISTS study_type    text    DEFAULT 'Realtime' CHECK (study_type IN ('Realtime','ASLT')),
  ADD COLUMN IF NOT EXISTS temperature_c numeric,
  ADD COLUMN IF NOT EXISTS accel_temp_c  numeric,
  ADD COLUMN IF NOT EXISTS q10_factor    numeric DEFAULT 2.0;
