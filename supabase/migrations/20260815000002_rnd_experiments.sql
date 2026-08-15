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

CREATE POLICY rnd_experiments_auth_all ON public.rnd_experiments
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
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
