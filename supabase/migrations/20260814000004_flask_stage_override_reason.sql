-- Data-integrity gates are enforced client-side as soft warnings (see
-- lib/batches/stageGates.js): a flask can still advance with incomplete
-- data, but the operator must type an override reason. Previously that
-- reason had nowhere to go — advance_flask_stage() only wrote a
-- stage_transitions row when the batch-level rollup stage changed, and
-- had no parameter to carry a reason at all. This adds an optional
-- p_override_reason and always logs one audit row per flask transition,
-- so every advance (and every override) is traceable in stage_transitions.
CREATE OR REPLACE FUNCTION advance_flask_stage(
  p_flask_id UUID,
  p_batch_id UUID,
  p_to_stage TEXT,
  p_employee_id UUID,
  p_flask_label TEXT DEFAULT NULL,
  p_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flask_status TEXT;
  v_from_stage TEXT;
  v_current_batch_stage TEXT;
  v_final_batch_stage TEXT;
  v_batch_status TEXT;
  v_stage_ranks TEXT[] := ARRAY['inoculation', 'fermentation', 'harvest', 'straining', 'qc_hold', 'released', 'rejected'];
  v_slowest_rank INT;
  v_rank INT;
  v_flask RECORD;
  v_active_count INT := 0;
BEGIN
  SELECT current_stage INTO v_from_stage FROM batch_flasks WHERE id = p_flask_id AND batch_id = p_batch_id;

  IF p_to_stage = 'rejected' THEN
    v_flask_status := 'rejected';
  ELSE
    v_flask_status := 'active';
  END IF;

  UPDATE batch_flasks
  SET current_stage = p_to_stage,
      status = v_flask_status
  WHERE id = p_flask_id AND batch_id = p_batch_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flask not found for this batch');
  END IF;

  -- Audit every per-flask transition (not just ones that move the batch-level
  -- rollup stage), so overrides and normal advances are both traceable.
  INSERT INTO stage_transitions (batch_id, from_stage, to_stage, changed_by, notes)
  VALUES (
    p_batch_id,
    v_from_stage,
    p_to_stage,
    p_employee_id,
    'Flask ' || COALESCE(p_flask_label, p_flask_id::text) || ' -> ' || p_to_stage ||
      CASE WHEN p_override_reason IS NOT NULL AND length(trim(p_override_reason)) > 0
           THEN ' | Override: ' || p_override_reason
           ELSE '' END
  );

  SELECT current_stage INTO v_current_batch_stage
  FROM batches
  WHERE id = p_batch_id;

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
  END IF;

  RETURN jsonb_build_object('success', true, 'new_stage', p_to_stage, 'batch_stage', v_final_batch_stage);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = '23514' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Database rejected this stage transition (Constraint Violation)', 'code', SQLSTATE);
  END IF;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;
