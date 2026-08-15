-- Phase 7: Media Prep, Inoculation, Sterilisation, QC, Release medium gaps
ALTER TABLE batch_stage_media_prep
  ADD COLUMN IF NOT EXISTS particle_size_mesh   text,
  ADD COLUMN IF NOT EXISTS aw_value             numeric,
  ADD COLUMN IF NOT EXISTS pre_treatment_steps  jsonb DEFAULT '[]';

ALTER TABLE batch_flask_inoculations
  ADD COLUMN IF NOT EXISTS flask_temp_c         numeric,
  ADD COLUMN IF NOT EXISTS back_slop_ratio_pct  numeric,
  ADD COLUMN IF NOT EXISTS co_starters          jsonb DEFAULT '[]';

ALTER TABLE batch_stage_sterilisation
  ADD COLUMN IF NOT EXISTS cycle2_temp_c    numeric,
  ADD COLUMN IF NOT EXISTS cycle2_hold_min  numeric,
  ADD COLUMN IF NOT EXISTS cycle2_start     timestamptz,
  ADD COLUMN IF NOT EXISTS cycle2_end       timestamptz,
  ADD COLUMN IF NOT EXISTS cycle2_tape      text,
  ADD COLUMN IF NOT EXISTS cooling_time_min numeric;
