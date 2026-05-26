-- Batch Monitoring edit/delete RPCs.
-- Replaces any older manual version so edited fermentation readings persist reliably.

ALTER TABLE public.batch_fermentation_readings
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edit_reason TEXT;

DROP FUNCTION IF EXISTS public.update_fermentation_reading(UUID, JSONB, TEXT);

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

DROP FUNCTION IF EXISTS public.delete_fermentation_reading(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.delete_fermentation_reading(
  p_reading_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason for deleting this reading is required.';
  END IF;

  DELETE FROM public.batch_fermentation_readings
  WHERE id = p_reading_id
  RETURNING TRUE INTO v_exists;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fermentation reading not found.';
  END IF;

  RETURN COALESCE(v_exists, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_fermentation_reading(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_fermentation_reading(UUID, TEXT) TO authenticated;
