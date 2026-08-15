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

CREATE POLICY pd_formulations_auth_all ON public.product_development_formulations
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
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
