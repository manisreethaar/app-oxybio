-- 0. Clean up existing rows that violate the new constraints!
UPDATE public.batches 
SET current_stage = 'straining' 
WHERE current_stage IN ('extract_addition', 'extraction');

UPDATE public.batch_flasks 
SET current_stage = 'straining' 
WHERE current_stage IN ('extract_addition', 'extraction');

-- Fix the stray legacy stages causing the constraint failure
UPDATE public.batches SET current_stage = 'media_prep' WHERE current_stage = 'INVALID_STAGE_TEST';
UPDATE public.batch_flasks SET current_stage = 'media_prep' WHERE current_stage = 'INVALID_STAGE_TEST';

UPDATE public.batches SET current_stage = 'harvest' WHERE current_stage = 'downstream';
UPDATE public.batch_flasks SET current_stage = 'harvest' WHERE current_stage = 'downstream';

-- 1. Add new columns to batch_flask_straining
ALTER TABLE public.batch_flask_straining
  ADD COLUMN IF NOT EXISTS freezing_time_hrs NUMERIC,
  ADD COLUMN IF NOT EXISTS thawing_time_hrs NUMERIC,
  ADD COLUMN IF NOT EXISTS straining_wt_after_g NUMERIC,
  ADD COLUMN IF NOT EXISTS straining_pellet_wet_wt_g NUMERIC,
  ADD COLUMN IF NOT EXISTS straining_sup_collected_ml NUMERIC,
  ADD COLUMN IF NOT EXISTS centrifuge_spins_count INTEGER,
  ADD COLUMN IF NOT EXISTS centrifuge_broth_obtained_ml NUMERIC,
  ADD COLUMN IF NOT EXISTS centrifuge_pellet_wet_wt_g NUMERIC,
  ADD COLUMN IF NOT EXISTS total_weight_obtained_g NUMERIC,
  ADD COLUMN IF NOT EXISTS drying_temp_c NUMERIC,
  ADD COLUMN IF NOT EXISTS drying_duration_hrs NUMERIC,
  ADD COLUMN IF NOT EXISTS dry_pellet_wt_g NUMERIC,
  ADD COLUMN IF NOT EXISTS storage_broth_details TEXT,
  ADD COLUMN IF NOT EXISTS storage_pellet_details TEXT;

-- 2. Drop extract_addition table since user confirmed it's safe to delete
DROP TABLE IF EXISTS public.batch_flask_extract_addition;

-- 3. Update batches stage constraint
ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS batches_current_stage_check;

ALTER TABLE public.batches
  ADD CONSTRAINT batches_current_stage_check
  CHECK (current_stage IN (
    'media_prep', 'sterilisation', 'inoculation', 'fermentation', 'harvest', 'straining',
    'qc_hold', 'released', 'rejected'
  ));

-- 4. Update batch_flasks stage constraint
ALTER TABLE public.batch_flasks
  DROP CONSTRAINT IF EXISTS batch_flasks_current_stage_check;

ALTER TABLE public.batch_flasks
  ADD CONSTRAINT batch_flasks_current_stage_check
  CHECK (current_stage IN (
    'inoculation', 'fermentation', 'harvest', 'straining',
    'qc_hold', 'released', 'rejected'
  ));

-- 5. Update advance_flask_stage RPC to remove extract_addition
CREATE OR REPLACE FUNCTION advance_flask_stage(
  p_flask_id UUID,
  p_batch_id UUID,
  p_to_stage TEXT,
  p_employee_id UUID,
  p_flask_label TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flask_status TEXT;
  v_current_batch_stage TEXT;
  v_final_batch_stage TEXT;
  v_batch_status TEXT;
  -- REMOVED extract_addition
  v_stage_ranks TEXT[] := ARRAY['inoculation', 'fermentation', 'harvest', 'straining', 'qc_hold', 'released', 'rejected'];
  v_slowest_rank INT;
  v_rank INT;
  v_flask RECORD;
  v_active_count INT := 0;
BEGIN
  -- 1. Determine flask status
  IF p_to_stage = 'rejected' THEN
    v_flask_status := 'rejected';
  ELSE
    v_flask_status := 'active';
  END IF;

  -- 2. Update the flask
  UPDATE batch_flasks
  SET current_stage = p_to_stage,
      status = v_flask_status
  WHERE id = p_flask_id AND batch_id = p_batch_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flask not found for this batch');
  END IF;

  -- 3. Get current batch stage
  SELECT current_stage INTO v_current_batch_stage
  FROM batches
  WHERE id = p_batch_id;

  -- 4. Calculate slowest active flask stage
  v_slowest_rank := array_position(v_stage_ranks, 'released');
  v_final_batch_stage := 'released';

  FOR v_flask IN 
    SELECT current_stage 
    FROM batch_flasks 
    WHERE batch_id = p_batch_id AND status != 'rejected'
  LOOP
    v_active_count := v_active_count + 1;
    v_rank := array_position(v_stage_ranks, COALESCE(v_flask.current_stage, 'inoculation'));
    
    IF v_rank IS NOT NULL AND v_rank < v_slowest_rank THEN
      v_slowest_rank := v_rank;
      v_final_batch_stage := v_stage_ranks[v_slowest_rank];
    END IF;
  END LOOP;

  IF v_active_count = 0 THEN
    v_final_batch_stage := 'rejected';
  END IF;

  -- 5. Update batch if stage changed
  IF v_final_batch_stage IS DISTINCT FROM v_current_batch_stage THEN
    
    CASE v_final_batch_stage
      WHEN 'fermentation' THEN v_batch_status := 'fermenting';
      WHEN 'qc_hold' THEN v_batch_status := 'qc-hold';
      WHEN 'released' THEN v_batch_status := 'released';
      WHEN 'rejected' THEN v_batch_status := 'rejected';
      ELSE v_batch_status := 'processing';
    END CASE;

    UPDATE batches
    SET current_stage = v_final_batch_stage,
        status = v_batch_status
    WHERE id = p_batch_id;

    -- Insert audit log
    INSERT INTO stage_transitions (batch_id, from_stage, to_stage, changed_by, notes)
    VALUES (
      p_batch_id, 
      v_current_batch_stage, 
      v_final_batch_stage, 
      p_employee_id, 
      'Flask ' || COALESCE(p_flask_label, p_flask_id::text) || ' advanced batch to ' || v_final_batch_stage
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'new_stage', p_to_stage, 'batch_stage', v_final_batch_stage);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = '23514' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Database rejected this stage transition (Constraint Violation)', 'code', SQLSTATE);
  END IF;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;
