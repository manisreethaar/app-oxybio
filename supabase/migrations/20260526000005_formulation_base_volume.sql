-- 20260526000005_formulation_base_volume.sql
-- Add base_volume_ml to formulations for dynamic recipe scaling

ALTER TABLE public.formulations
ADD COLUMN IF NOT EXISTS base_volume_ml NUMERIC NOT NULL DEFAULT 1000;
