-- Phase 8: Centrifugation & Incubation gaps
ALTER TABLE batch_flask_straining
  ADD COLUMN IF NOT EXISTS rotor_radius_cm             numeric,
  ADD COLUMN IF NOT EXISTS pass2_rpm                   numeric,
  ADD COLUMN IF NOT EXISTS pass2_duration_min          numeric,
  ADD COLUMN IF NOT EXISTS pass2_temp_c                numeric,
  ADD COLUMN IF NOT EXISTS turbidity_ntu               numeric,
  ADD COLUMN IF NOT EXISTS pellet_resuspension_buffer  text,
  ADD COLUMN IF NOT EXISTS pellet_resuspension_vol_ml  numeric;

ALTER TABLE sample_incubation_records
  ADD COLUMN IF NOT EXISTS plate_image_url  text,
  ADD COLUMN IF NOT EXISTS is_duplicate     boolean DEFAULT false;
