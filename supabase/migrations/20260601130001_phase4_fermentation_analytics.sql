-- Phase 4: Fermentation analytics & endpoint quality gaps
-- G-30: Titratable Acidity on readings + endpoints
ALTER TABLE batch_fermentation_readings ADD COLUMN IF NOT EXISTS titratable_acidity_pct numeric;
ALTER TABLE batch_flask_endpoints       ADD COLUMN IF NOT EXISTS titratable_acidity_pct numeric;

-- G-32: Gram stain image URL on endpoints
ALTER TABLE batch_flask_endpoints ADD COLUMN IF NOT EXISTS gram_stain_image_url text;

-- G-34: Sampling plan on inoculation record
ALTER TABLE batch_flask_inoculations ADD COLUMN IF NOT EXISTS sampling_plan_hrs text[] DEFAULT '{}';

-- G-35 to G-38: Extract Addition process data
ALTER TABLE batch_flask_extract_addition
  ADD COLUMN IF NOT EXISTS mixing_time_min         numeric,
  ADD COLUMN IF NOT EXISTS mixing_speed_rpm        numeric,
  ADD COLUMN IF NOT EXISTS post_mixing_ph_check    numeric,
  ADD COLUMN IF NOT EXISTS post_mixing_brix        numeric,
  ADD COLUMN IF NOT EXISTS blend_homogeneity_check text,
  ADD COLUMN IF NOT EXISTS addition_temp_actual_c  numeric;
