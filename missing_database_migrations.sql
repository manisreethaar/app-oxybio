-- Missing database migrations that were not applied.
-- Run this entire block in your Supabase SQL Editor.



-- From 20260815000001_product_development_formulations.sql
-- The Product Development module ("/product-development") previously stored
-- RTD formulation records as a free-text blob appended to batches.notes
-- (see app/api/product-development/consume/route.js), so a saved
-- formulation could never be reviewed, reloaded, or queried afterward.
-- This gives it real, queryable tables instead.
CREATE TABLE IF NOT EXISTS public.product_development_formulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  target_volume_ml NUMERIC,
  target_ph NUMERIC,
  target_brix NUMERIC,
  notes TEXT,
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_development_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formulation_id UUID NOT NULL REFERENCES public.product_development_formulations(id) ON DELETE CASCADE,
  stock_id UUID REFERENCES public.inventory_stock(id),
  item_name TEXT,
  amount NUMERIC NOT NULL,
  unit TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pd_formulations_batch ON public.product_development_formulations(batch_id);
CREATE INDEX IF NOT EXISTS idx_pd_ingredients_formulation ON public.product_development_ingredients(formulation_id);

ALTER TABLE public.product_development_formulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_development_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pd_formulations_auth_all ON public.product_development_formulations;
CREATE POLICY pd_formulations_auth_all ON public.product_development_formulations
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS pd_ingredients_auth_all ON public.product_development_ingredients;
CREATE POLICY pd_ingredients_auth_all ON public.product_development_ingredients
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Atomically validates stock for every ingredient (holding row locks) before
-- deducting any of them, then records the formulation + ingredients in the
-- same transaction. Replaces the old per-ingredient read-then-update loop in
-- the API route, which could both lose updates under concurrent requests and
-- leave inventory partially deducted if a later ingredient failed.
CREATE OR REPLACE FUNCTION record_product_development_formulation(
  p_batch_id UUID,
  p_employee_id UUID,
  p_target_volume_ml NUMERIC,
  p_target_ph NUMERIC,
  p_target_brix NUMERIC,
  p_notes TEXT,
  p_ingredients JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_formulation_id UUID;
  v_ing JSONB;
  v_stock_id UUID;
  v_amount NUMERIC;
  v_current_qty NUMERIC;
  v_item_id UUID;
  v_item_name TEXT;
  v_unit TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM batches WHERE id = p_batch_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Batch not found');
  END IF;

  -- Pass 1: lock and validate every ingredient's stock. Row locks acquired
  -- here are held until this function's transaction ends, so a concurrent
  -- call touching the same stock rows blocks instead of racing.
  FOR v_ing IN SELECT * FROM jsonb_array_elements(COALESCE(p_ingredients, '[]'::jsonb))
  LOOP
    v_stock_id := NULLIF(v_ing->>'stock_id', '')::UUID;
    v_amount := NULLIF(v_ing->>'amount', '')::NUMERIC;
    IF v_stock_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;

    SELECT current_quantity INTO v_current_qty
    FROM inventory_stock WHERE id = v_stock_id FOR UPDATE;

    IF v_current_qty IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Stock not found: ' || v_stock_id::text);
    END IF;
    IF v_current_qty < v_amount THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Insufficient stock for ' || v_stock_id::text || ' (' || v_current_qty || ' available, ' || v_amount || ' requested)');
    END IF;
  END LOOP;

  INSERT INTO product_development_formulations (batch_id, target_volume_ml, target_ph, target_brix, notes, created_by)
  VALUES (p_batch_id, p_target_volume_ml, p_target_ph, p_target_brix, p_notes, p_employee_id)
  RETURNING id INTO v_formulation_id;

  -- Pass 2: apply the deductions and record each ingredient.
  FOR v_ing IN SELECT * FROM jsonb_array_elements(COALESCE(p_ingredients, '[]'::jsonb))
  LOOP
    v_stock_id := NULLIF(v_ing->>'stock_id', '')::UUID;
    v_amount := NULLIF(v_ing->>'amount', '')::NUMERIC;
    IF v_stock_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;

    SELECT item_id INTO v_item_id FROM inventory_stock WHERE id = v_stock_id;
    SELECT name, unit INTO v_item_name, v_unit FROM inventory_items WHERE id = v_item_id;

    UPDATE inventory_stock
    SET current_quantity = current_quantity - v_amount
    WHERE id = v_stock_id;

    INSERT INTO product_development_ingredients (formulation_id, stock_id, item_name, amount, unit)
    VALUES (v_formulation_id, v_stock_id, v_item_name, v_amount, v_unit);
  END LOOP;

  UPDATE batches
  SET planned_volume_ml = COALESCE(p_target_volume_ml, planned_volume_ml)
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'formulation_id', v_formulation_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

NOTIFY pgrst, 'reload schema';


-- From 20260815000002_rnd_experiments.sql
-- Standalone R&D experiments: the other half of Product Development.
-- Unlike product_development_formulations (which always attaches to an
-- existing production batches row), an experiment here has no batch at
-- all — it gets its own ID scheme, is never "promoted" into a batch, and
-- goes through its own approval/review flow. It still consumes real
-- inventory, same as the batch-linked flow.
CREATE TABLE IF NOT EXISTS public.rnd_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  target_volume_ml NUMERIC,
  target_ph NUMERIC,
  target_brix NUMERIC,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected')),
  created_by UUID REFERENCES public.employees(id),
  reviewed_by UUID REFERENCES public.employees(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rnd_experiment_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.rnd_experiments(id) ON DELETE CASCADE,
  stock_id UUID REFERENCES public.inventory_stock(id),
  item_name TEXT,
  amount NUMERIC NOT NULL,
  unit TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rnd_experiments_status ON public.rnd_experiments(status);
CREATE INDEX IF NOT EXISTS idx_rnd_experiment_ingredients_experiment ON public.rnd_experiment_ingredients(experiment_id);

ALTER TABLE public.rnd_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rnd_experiment_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rnd_experiments_auth_all ON public.rnd_experiments;
CREATE POLICY rnd_experiments_auth_all ON public.rnd_experiments
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS rnd_experiment_ingredients_auth_all ON public.rnd_experiment_ingredients;
CREATE POLICY rnd_experiment_ingredients_auth_all ON public.rnd_experiment_ingredients
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Same validate-then-deduct pattern as record_product_development_formulation:
-- locks and checks every ingredient's stock before deducting any of them, then
-- creates the experiment record and its ingredients in the same transaction.
CREATE OR REPLACE FUNCTION record_rnd_experiment(
  p_experiment_id TEXT,
  p_title TEXT,
  p_employee_id UUID,
  p_target_volume_ml NUMERIC,
  p_target_ph NUMERIC,
  p_target_brix NUMERIC,
  p_notes TEXT,
  p_ingredients JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_ing JSONB;
  v_stock_id UUID;
  v_amount NUMERIC;
  v_current_qty NUMERIC;
  v_item_id UUID;
  v_item_name TEXT;
  v_unit TEXT;
BEGIN
  FOR v_ing IN SELECT * FROM jsonb_array_elements(COALESCE(p_ingredients, '[]'::jsonb))
  LOOP
    v_stock_id := NULLIF(v_ing->>'stock_id', '')::UUID;
    v_amount := NULLIF(v_ing->>'amount', '')::NUMERIC;
    IF v_stock_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;

    SELECT current_quantity INTO v_current_qty
    FROM inventory_stock WHERE id = v_stock_id FOR UPDATE;

    IF v_current_qty IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Stock not found: ' || v_stock_id::text);
    END IF;
    IF v_current_qty < v_amount THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Insufficient stock for ' || v_stock_id::text || ' (' || v_current_qty || ' available, ' || v_amount || ' requested)');
    END IF;
  END LOOP;

  INSERT INTO rnd_experiments (experiment_id, title, target_volume_ml, target_ph, target_brix, notes, created_by)
  VALUES (p_experiment_id, p_title, p_target_volume_ml, p_target_ph, p_target_brix, p_notes, p_employee_id)
  RETURNING id INTO v_id;

  FOR v_ing IN SELECT * FROM jsonb_array_elements(COALESCE(p_ingredients, '[]'::jsonb))
  LOOP
    v_stock_id := NULLIF(v_ing->>'stock_id', '')::UUID;
    v_amount := NULLIF(v_ing->>'amount', '')::NUMERIC;
    IF v_stock_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;

    SELECT item_id INTO v_item_id FROM inventory_stock WHERE id = v_stock_id;
    SELECT name, unit INTO v_item_name, v_unit FROM inventory_items WHERE id = v_item_id;

    UPDATE inventory_stock
    SET current_quantity = current_quantity - v_amount
    WHERE id = v_stock_id;

    INSERT INTO rnd_experiment_ingredients (experiment_id, stock_id, item_name, amount, unit)
    VALUES (v_id, v_stock_id, v_item_name, v_amount, v_unit);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'experiment_id', p_experiment_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

NOTIFY pgrst, 'reload schema';


-- From 20260815000003_advance_flask_stage_validation.sql
-- Two fixes to advance_flask_stage(), part of collapsing the module's five
-- divergent stage-transition write-paths into one properly-audited one:
--
-- 1. Server-side "is this actually the next legal stage" validation. Until
--    now the RPC accepted any DB-legal stage string regardless of the
--    flask's current stage — all sequencing was enforced only by which
--    panel happened to be open client-side, so a direct API/RPC call could
--    skip stages entirely (e.g. inoculation straight to qc_hold). This
--    mirrors lib/batches/workflowStages.js's STAGE_TRANSITIONS map — keep
--    both in sync if the pipeline order ever changes.
--
-- 2. Restore logging a stage_transitions row for the batch-level rollup
--    change, not just the per-flask row. This existed in the original
--    (20260811000001) version but was silently dropped when
--    20260814000004 switched to always-log-the-flask-row — so today the
--    Stage History panel shows every flask move but never shows *why* the
--    batch's own current_stage/status changed as a result.
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
  v_allowed_next TEXT[];
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

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flask not found for this batch');
  END IF;

  v_allowed_next := CASE v_from_stage
    WHEN 'inoculation'  THEN ARRAY['fermentation']
    WHEN 'fermentation' THEN ARRAY['harvest']
    WHEN 'harvest'      THEN ARRAY['straining']
    WHEN 'straining'    THEN ARRAY['qc_hold']
    WHEN 'qc_hold'      THEN ARRAY['released', 'rejected']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_to_stage = ANY(v_allowed_next)) THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Cannot advance from %s to %s — not a legal next stage.', COALESCE(v_from_stage, '(none)'), p_to_stage));
  END IF;

  IF p_to_stage = 'rejected' THEN
    v_flask_status := 'rejected';
  ELSE
    v_flask_status := 'active';
  END IF;

  UPDATE batch_flasks
  SET current_stage = p_to_stage,
      status = v_flask_status
  WHERE id = p_flask_id AND batch_id = p_batch_id;

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

    INSERT INTO stage_transitions (batch_id, from_stage, to_stage, changed_by, notes)
    VALUES (
      p_batch_id,
      v_current_batch_stage,
      v_final_batch_stage,
      p_employee_id,
      'Batch rollup — slowest active trial now at ' || v_final_batch_stage
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

NOTIFY pgrst, 'reload schema';


-- From 20260815000004_batch_media_prep_ingredients.sql
-- MediaPrepPanel's BOM lot-selection UI already captures a lot + quantity
-- for every formulation ingredient (bomUsage state), but the GMP record
-- (batch_stage_media_prep) only ever persisted two of them — ragi and
-- kavuni, via hardcoded ragi_lot_id/kavuni_lot_id columns. Any other
-- ingredient in the formulation lost lot traceability in the GMP record
-- (still deducted from inventory, but with no batch-linked audit trail),
-- and RejectionPanel's "Implicated Lot" dropdown could only ever
-- implicate ragi or kavuni for the same reason. This table captures the
-- full BOM usage generically so both gaps are fixed.
CREATE TABLE IF NOT EXISTS public.batch_media_prep_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  stock_id UUID,
  item_id UUID,
  item_name TEXT,
  used_qty NUMERIC,
  unit TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_media_prep_ingredients_batch_id ON public.batch_media_prep_ingredients (batch_id);

ALTER TABLE public.batch_media_prep_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bmpi_auth_all ON public.batch_media_prep_ingredients;
CREATE POLICY bmpi_auth_all ON public.batch_media_prep_ingredients
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';


-- From 20260815000005_advance_flask_stage_allow_reject_any_stage.sql
-- advance_flask_stage()'s legal-transition validation (added in
-- 20260815000003) only allowed 'rejected' as a target from qc_hold. But the
-- Abort/Reject Trial action in both app/batches/[batchId]/page.js and
-- app/downstream/[batchId]/page.js has always been available from any
-- active flask stage (inoculation, fermentation, harvest, straining), not
-- just qc_hold. That made the new server-side validation stricter than the
-- UI it's meant to support, silently blocking early-stage rejections.
--
-- Fix: allow 'rejected' as an additional legal target from inoculation,
-- fermentation, harvest, and straining, matching
-- lib/batches/workflowStages.js's STAGE_TRANSITIONS map.
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
  v_allowed_next TEXT[];
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

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flask not found for this batch');
  END IF;

  v_allowed_next := CASE v_from_stage
    WHEN 'inoculation'  THEN ARRAY['fermentation', 'rejected']
    WHEN 'fermentation' THEN ARRAY['harvest', 'rejected']
    WHEN 'harvest'      THEN ARRAY['straining', 'rejected']
    WHEN 'straining'    THEN ARRAY['qc_hold', 'rejected']
    WHEN 'qc_hold'      THEN ARRAY['released', 'rejected']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_to_stage = ANY(v_allowed_next)) THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Cannot advance from %s to %s — not a legal next stage.', COALESCE(v_from_stage, '(none)'), p_to_stage));
  END IF;

  IF p_to_stage = 'rejected' THEN
    v_flask_status := 'rejected';
  ELSE
    v_flask_status := 'active';
  END IF;

  UPDATE batch_flasks
  SET current_stage = p_to_stage,
      status = v_flask_status
  WHERE id = p_flask_id AND batch_id = p_batch_id;

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

    INSERT INTO stage_transitions (batch_id, from_stage, to_stage, changed_by, notes)
    VALUES (
      p_batch_id,
      v_current_batch_stage,
      v_final_batch_stage,
      p_employee_id,
      'Batch rollup — slowest active trial now at ' || v_final_batch_stage
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

NOTIFY pgrst, 'reload schema';
