-- Seed Train stage transitions (Protocol -> Seed 1/2/3 -> Production) were
-- previously three unaudited, unauthorized, non-atomic client-side writes
-- per transfer (ProtocolSetupPanel.handleSave, SeedPhasePanel.handleTransfer):
-- insert the new batch_seed_trains row, mark the old one completed, update
-- batches.current_stage — with no permission check and no stage_transitions
-- row, and no guarantee all three succeed together.
--
-- This collapses that into one audited, authorized, atomic RPC, mirroring
-- the advance_flask_stage() pattern already used for flask-level stages.
CREATE OR REPLACE FUNCTION advance_seed_train_stage(
  p_batch_id UUID,
  p_to_stage TEXT,
  p_employee_id UUID,
  p_current_seed_train_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch RECORD;
  v_employee_role TEXT;
  v_allowed_next TEXT[];
  v_new_status TEXT;
BEGIN
  SELECT id, current_stage, status, created_by, assigned_team
  INTO v_batch
  FROM batches
  WHERE id = p_batch_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Batch not found');
  END IF;

  -- Authorization: creator, an assigned team member, or leadership.
  SELECT role INTO v_employee_role FROM employees WHERE id = p_employee_id;
  IF v_employee_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Employee profile not found');
  END IF;

  IF NOT (
    v_batch.created_by = p_employee_id
    OR p_employee_id = ANY(COALESCE(v_batch.assigned_team, ARRAY[]::UUID[]))
    OR lower(v_employee_role) IN ('ceo', 'cto', 'admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Only assigned team members, the creator, or leadership can operate this batch.');
  END IF;

  -- Legal-transition table — keep in sync with lib/batches/workflowStages.js's
  -- STAGE_TRANSITIONS. NULL current_stage (batch never started) can only move
  -- to seed_1.
  v_allowed_next := CASE COALESCE(v_batch.current_stage, '')
    WHEN ''       THEN ARRAY['seed_1']
    WHEN 'seed_1' THEN ARRAY['seed_2', 'seed_3', 'production']
    WHEN 'seed_2' THEN ARRAY['seed_3', 'production']
    WHEN 'seed_3' THEN ARRAY['production']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_to_stage = ANY(v_allowed_next)) THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Cannot advance from %s to %s — not a legal next stage.',
        COALESCE(NULLIF(v_batch.current_stage, ''), '(not started)'), p_to_stage));
  END IF;

  IF p_current_seed_train_id IS NOT NULL THEN
    UPDATE batch_seed_trains SET status = 'completed' WHERE id = p_current_seed_train_id;
  END IF;

  INSERT INTO batch_seed_trains (batch_id, stage_type, status)
  VALUES (p_batch_id, p_to_stage, 'active');

  v_new_status := CASE WHEN p_to_stage = 'production' THEN 'processing' ELSE 'in-progress' END;

  UPDATE batches
  SET current_stage = p_to_stage,
      status = v_new_status
  WHERE id = p_batch_id;

  INSERT INTO stage_transitions (batch_id, from_stage, to_stage, changed_by, notes)
  VALUES (p_batch_id, NULLIF(v_batch.current_stage, ''), p_to_stage, p_employee_id,
    'Seed Train transferred to ' || p_to_stage);

  RETURN jsonb_build_object('success', true, 'new_stage', p_to_stage);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = '23514' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Database rejected this stage transition (Constraint Violation)', 'code', SQLSTATE);
  END IF;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

NOTIFY pgrst, 'reload schema';
