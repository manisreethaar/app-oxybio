-- Link interval fermentation plating to sample incubation records.

ALTER TABLE public.batch_fermentation_readings
  ADD COLUMN IF NOT EXISTS plating_done BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plating_status TEXT NOT NULL DEFAULT 'not_done',
  ADD COLUMN IF NOT EXISTS plating_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sample_incubation_id UUID REFERENCES public.sample_incubation_records(id) ON DELETE SET NULL;

ALTER TABLE public.batch_fermentation_readings
  DROP CONSTRAINT IF EXISTS batch_fermentation_readings_plating_status_check;

ALTER TABLE public.batch_fermentation_readings
  ADD CONSTRAINT batch_fermentation_readings_plating_status_check
  CHECK (plating_status IN ('not_done', 'done_incubating', 'completed'));

ALTER TABLE public.sample_incubation_records
  ADD COLUMN IF NOT EXISTS fermentation_reading_id UUID REFERENCES public.batch_fermentation_readings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ferm_readings_sample_incubation
  ON public.batch_fermentation_readings(sample_incubation_id);

CREATE INDEX IF NOT EXISTS idx_sample_incubation_ferm_reading
  ON public.sample_incubation_records(fermentation_reading_id);

CREATE INDEX IF NOT EXISTS idx_ferm_readings_plating_status
  ON public.batch_fermentation_readings(plating_status);

UPDATE public.batch_fermentation_readings
SET
  plating_done = true,
  plating_status = 'done_incubating'
WHERE
  COALESCE(plating_result, '') <> ''
  AND plating_status = 'not_done'
  AND LOWER(plating_result) NOT IN ('not done', 'not_done');

CREATE OR REPLACE FUNCTION public.update_fermentation_reading(
  p_reading_id UUID,
  p_updates JSONB,
  p_reason TEXT
)
RETURNS public.batch_fermentation_readings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
  v_row public.batch_fermentation_readings;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason for editing this reading is required.';
  END IF;

  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;

  UPDATE public.batch_fermentation_readings
  SET
    ph = CASE WHEN p_updates ? 'ph' THEN NULLIF(p_updates->>'ph', '')::NUMERIC ELSE ph END,
    incubator_temp_c = CASE WHEN p_updates ? 'incubator_temp_c' THEN NULLIF(p_updates->>'incubator_temp_c', '')::NUMERIC ELSE incubator_temp_c END,
    brix = CASE WHEN p_updates ? 'brix' THEN NULLIF(p_updates->>'brix', '')::NUMERIC ELSE brix END,
    optical_density = CASE WHEN p_updates ? 'optical_density' THEN NULLIF(p_updates->>'optical_density', '')::NUMERIC ELSE optical_density END,
    foam_level = CASE WHEN p_updates ? 'foam_level' THEN NULLIF(p_updates->>'foam_level', '') ELSE foam_level END,
    visual_appearance = CASE WHEN p_updates ? 'visual_appearance' THEN NULLIF(p_updates->>'visual_appearance', '') ELSE visual_appearance END,
    plating_result = CASE WHEN p_updates ? 'plating_result' THEN NULLIF(p_updates->>'plating_result', '') ELSE plating_result END,
    plating_done = CASE WHEN p_updates ? 'plating_done' THEN (p_updates->>'plating_done')::BOOLEAN ELSE plating_done END,
    plating_status = CASE WHEN p_updates ? 'plating_status' THEN NULLIF(p_updates->>'plating_status', '') ELSE plating_status END,
    plating_config = CASE WHEN p_updates ? 'plating_config' THEN p_updates->'plating_config' ELSE plating_config END,
    sample_incubation_id = CASE WHEN p_updates ? 'sample_incubation_id' THEN NULLIF(p_updates->>'sample_incubation_id', '')::UUID ELSE sample_incubation_id END,
    notes = CASE WHEN p_updates ? 'notes' THEN NULLIF(p_updates->>'notes', '') ELSE notes END,
    logged_at = CASE WHEN p_updates ? 'logged_at' THEN (p_updates->>'logged_at')::TIMESTAMPTZ ELSE logged_at END,
    elapsed_hours = CASE WHEN p_updates ? 'elapsed_hours' THEN NULLIF(p_updates->>'elapsed_hours', '')::NUMERIC ELSE elapsed_hours END,
    is_retrospective = CASE WHEN p_updates ? 'is_retrospective' THEN (p_updates->>'is_retrospective')::BOOLEAN ELSE is_retrospective END,
    retro_reason = CASE WHEN p_updates ? 'retro_reason' THEN NULLIF(p_updates->>'retro_reason', '') ELSE retro_reason END,
    edited_at = now(),
    edited_by = v_employee_id,
    edit_reason = trim(p_reason)
  WHERE id = p_reading_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fermentation reading not found.';
  END IF;

  RETURN v_row;
END;
$$;
