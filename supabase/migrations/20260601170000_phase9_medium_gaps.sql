-- Phase 9: Lab Bench, Notebook, Formulations, Fermentation, Sterilisation medium gaps
ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS reagents_used       jsonb   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS cold_storage_temp_c numeric;

ALTER TABLE batch_fermentation_readings
  ADD COLUMN IF NOT EXISTS co2_observed  text,
  ADD COLUMN IF NOT EXISTS ethanol_pct   numeric;

ALTER TABLE batch_stage_sterilisation
  ADD COLUMN IF NOT EXISTS steam_quality_check text,
  ADD COLUMN IF NOT EXISTS condensate_check    text;

ALTER TABLE formulations
  ADD COLUMN IF NOT EXISTS nutritional_info    jsonb  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS yield_predicted_ml  numeric,
  ADD COLUMN IF NOT EXISTS regulatory_claims   text[] DEFAULT '{}';
