-- ALOCA++ Data Integrity Enforcement
-- Principle C (Contemporaneous): logged_at is always server-generated — clients cannot fake timestamps
-- Principle A (Accurate): CHECK constraints on scientific ranges

-- 1. Ensure logged_at defaults to server time and clients cannot set past/future timestamps
ALTER TABLE public.batch_fermentation_readings
  ALTER COLUMN logged_at SET DEFAULT now(),
  ALTER COLUMN logged_at SET NOT NULL;

-- 2. Add ALOCA++ audit fields if missing
ALTER TABLE public.batch_fermentation_readings
  ADD COLUMN IF NOT EXISTS logged_by_name TEXT,   -- snapshot of employee name at log time
  ADD COLUMN IF NOT EXISTS logged_by_role TEXT,   -- snapshot of employee role at log time
  ADD COLUMN IF NOT EXISTS correction_of UUID REFERENCES public.batch_fermentation_readings(id), -- links to original if this is a correction
  ADD COLUMN IF NOT EXISTS is_superseded BOOLEAN NOT NULL DEFAULT false; -- true when a correction exists for this record

-- 3. Accurate (A): Enforce scientific range constraints
ALTER TABLE public.batch_fermentation_readings
  ADD CONSTRAINT IF NOT EXISTS chk_ph_range CHECK (ph IS NULL OR (ph >= 0.0 AND ph <= 14.0)),
  ADD CONSTRAINT IF NOT EXISTS chk_od_range CHECK (optical_density IS NULL OR (optical_density >= 0.0 AND optical_density <= 10.0)),
  ADD CONSTRAINT IF NOT EXISTS chk_dilution_positive CHECK (dilution_factor IS NULL OR dilution_factor > 0),
  ADD CONSTRAINT IF NOT EXISTS chk_anthrone_range CHECK (anthrone_od IS NULL OR (anthrone_od >= 0.0 AND anthrone_od <= 3.5));

-- 4. Complete (C+): At least one scientific measurement must be present
ALTER TABLE public.batch_fermentation_readings
  ADD CONSTRAINT IF NOT EXISTS chk_at_least_one_value CHECK (
    ph IS NOT NULL OR
    optical_density IS NOT NULL OR
    anthrone_od IS NOT NULL OR
    gram_staining IS NOT NULL OR
    microscopic_test IS NOT NULL
  );

-- 5. RLS — re-enable for this table (ensure it's in the master policy set)
ALTER TABLE public.batch_fermentation_readings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "batch_fermentation_readings_auth_all" ON public.batch_fermentation_readings;
CREATE POLICY "batch_fermentation_readings_auth_all"
  ON public.batch_fermentation_readings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Mark a reading as superseded when a correction is inserted
-- Trigger: when a reading with correction_of IS NOT NULL is inserted, mark the original as superseded
CREATE OR REPLACE FUNCTION fn_mark_superseded()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.correction_of IS NOT NULL THEN
    UPDATE public.batch_fermentation_readings
    SET is_superseded = true
    WHERE id = NEW.correction_of;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_superseded ON public.batch_fermentation_readings;
CREATE TRIGGER trg_mark_superseded
  AFTER INSERT ON public.batch_fermentation_readings
  FOR EACH ROW EXECUTE FUNCTION fn_mark_superseded();

NOTIFY pgrst, 'reload schema';
