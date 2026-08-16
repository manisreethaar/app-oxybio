-- Tier-1 Downstream Processing (DSP) Migration

-- 1. Upgrade batch_flask_straining (Separation Panel) with strict ALOCA++ and Equipment tracking
ALTER TABLE public.batch_flask_straining
  -- Freezing & Thawing
  ADD COLUMN IF NOT EXISTS freezer_equipment_id uuid REFERENCES public.equipment(id),
  ADD COLUMN IF NOT EXISTS freezing_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS freezing_end_time timestamptz,
  ADD COLUMN IF NOT EXISTS thawing_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS thawing_end_time timestamptz,
  DROP COLUMN IF EXISTS freezing_time_hrs,
  DROP COLUMN IF EXISTS thawing_time_hrs,

  -- Filtration
  ADD COLUMN IF NOT EXISTS filtration_equipment_id uuid REFERENCES public.equipment(id),
  ADD COLUMN IF NOT EXISTS pre_filtration_vol_ml numeric,
  ADD COLUMN IF NOT EXISTS post_filtration_vol_ml numeric,
  ADD COLUMN IF NOT EXISTS filtration_solid_wt_g numeric,
  DROP COLUMN IF EXISTS pre_straining_vol_ml,
  DROP COLUMN IF EXISTS post_straining_vol_ml,
  DROP COLUMN IF EXISTS broth_wt_before_g,
  DROP COLUMN IF EXISTS straining_wt_after_g,
  DROP COLUMN IF EXISTS straining_pellet_wet_wt_g,
  DROP COLUMN IF EXISTS straining_sup_collected_ml,

  -- Centrifugation
  ADD COLUMN IF NOT EXISTS centrifuge_equipment_id uuid REFERENCES public.equipment(id),
  ADD COLUMN IF NOT EXISTS centrifuge_rpm numeric,
  ADD COLUMN IF NOT EXISTS centrifuge_pre_vol_ml numeric,
  ADD COLUMN IF NOT EXISTS centrifuge_post_vol_ml numeric,
  DROP COLUMN IF EXISTS centrifuge_broth_obtained_ml,

  -- Storage & Yields
  ADD COLUMN IF NOT EXISTS final_broth_vol_ml numeric,
  ADD COLUMN IF NOT EXISTS broth_storage_equipment_id uuid REFERENCES public.equipment(id),
  ADD COLUMN IF NOT EXISTS pellet_storage_equipment_id uuid REFERENCES public.equipment(id),
  ADD COLUMN IF NOT EXISTS pellet_storage_location text,
  ADD COLUMN IF NOT EXISTS broth_storage_location text,
  DROP COLUMN IF EXISTS storage_broth_details,
  DROP COLUMN IF EXISTS storage_pellet_details,

  -- Drying
  ADD COLUMN IF NOT EXISTS dryer_equipment_id uuid REFERENCES public.equipment(id),
  ADD COLUMN IF NOT EXISTS drying_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS drying_end_time timestamptz,
  ADD COLUMN IF NOT EXISTS wet_pellet_wt_g numeric,
  DROP COLUMN IF EXISTS drying_duration_hrs,

  -- ALOCA++ Fields
  ADD COLUMN IF NOT EXISTS logged_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS logged_by uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS logged_by_name text,
  ADD COLUMN IF NOT EXISTS logged_by_role text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.employees(id);

-- 2. Add to Supabase Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'batch_flask_straining'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE batch_flask_straining;
  END IF;
END $$;
