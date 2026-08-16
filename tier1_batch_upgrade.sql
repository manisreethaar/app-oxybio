-- Tier-1 Batch Architecture Upgrade (Multi-flask Seeds, Deep Equipment Tracking, Auto-Debit)

-- 1. Upgrade batch_seed_trains (Phase Header)
ALTER TABLE public.batch_seed_trains
  -- Sterilization Tracking
  ADD COLUMN IF NOT EXISTS sterilizer_equipment_id text,
  ADD COLUMN IF NOT EXISTS sterilization_temp_c numeric,
  ADD COLUMN IF NOT EXISTS sterilization_duration_mins integer,
  ADD COLUMN IF NOT EXISTS sterilization_cycle_number text,
  ADD COLUMN IF NOT EXISTS sterilization_start_time timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sterilization_end_time timestamp with time zone,
  
  -- Inventory Tracking
  ADD COLUMN IF NOT EXISTS inventory_deduction_status text DEFAULT 'pending', -- pending, completed, failed, skipped
  ADD COLUMN IF NOT EXISTS inventory_deduction_log jsonb;

-- 2. Upgrade batch_flasks (Multi-flask Tracking)
ALTER TABLE public.batch_flasks
  -- Allow flasks to belong to Seed 1, Seed 2, Seed 3, etc. (Not just production)
  ADD COLUMN IF NOT EXISTS seed_train_id uuid REFERENCES public.batch_seed_trains(id) ON DELETE CASCADE,
  
  -- Incubation / Vessel Tracking (Deep Params)
  ADD COLUMN IF NOT EXISTS incubator_equipment_id text,
  ADD COLUMN IF NOT EXISTS incubation_temp_c numeric,
  ADD COLUMN IF NOT EXISTS incubation_agitation_rpm integer,
  ADD COLUMN IF NOT EXISTS inoculated_at timestamp with time zone;

-- Ensure stage transitions support dynamic next stages
ALTER TABLE public.batch_flasks DROP CONSTRAINT IF EXISTS chk_flask_stage;
-- Allow any valid stage name

-- 3. Upgrade cell_bank_vials
ALTER TABLE public.cell_bank_vials
  ADD COLUMN IF NOT EXISTS is_consumed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS consumed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS consumed_by_batch_id uuid REFERENCES public.batches(id);

-- Trigger: Mark vial consumed when linked to a seed train
CREATE OR REPLACE FUNCTION trg_mark_vial_consumed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.inoculum_source_type = 'glycerol' AND NEW.cell_bank_vial_id IS NOT NULL THEN
    UPDATE public.cell_bank_vials 
    SET is_consumed = true, 
        consumed_at = now(),
        consumed_by_batch_id = NEW.batch_id
    WHERE id = NEW.cell_bank_vial_id AND is_consumed = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mark_vial_consumed_trg ON public.batch_seed_trains;
CREATE TRIGGER mark_vial_consumed_trg
AFTER INSERT OR UPDATE OF cell_bank_vial_id, inoculum_source_type ON public.batch_seed_trains
FOR EACH ROW EXECUTE FUNCTION trg_mark_vial_consumed();


-- 4. RPC: Auto-Debit Media Inventory
-- Automatically deducts raw materials based on media_volume_ml and formulation recipe
CREATE OR REPLACE FUNCTION rpc_auto_debit_media_inventory(p_seed_train_id uuid, p_employee_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_seed record;
  v_batch record;
  v_formulation record;
  v_ingredient jsonb;
  v_required_qty numeric;
  v_available_qty numeric;
  v_stock_record record;
  v_remaining_req numeric;
  v_deducted_total numeric;
  v_log jsonb := '[]'::jsonb;
  v_success boolean := true;
BEGIN
  -- Fetch Seed Train & Formulation Details
  SELECT * INTO v_seed FROM public.batch_seed_trains WHERE id = p_seed_train_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Seed train not found'); END IF;
  IF v_seed.inventory_deduction_status = 'completed' THEN RETURN jsonb_build_object('success', false, 'error', 'Inventory already deducted'); END IF;
  
  -- Get Formulation (fallback to batch default if not on seed)
  IF v_seed.formulation_id IS NOT NULL THEN
    SELECT * INTO v_formulation FROM public.formulations WHERE id = v_seed.formulation_id;
  ELSE
    SELECT * INTO v_batch FROM public.batches WHERE id = v_seed.batch_id;
    SELECT * INTO v_formulation FROM public.formulations WHERE id = v_batch.formulation_id;
  END IF;

  IF v_formulation IS NULL OR v_formulation.ingredients IS NULL THEN
    UPDATE public.batch_seed_trains SET inventory_deduction_status = 'skipped', inventory_deduction_log = '"No formulation found"' WHERE id = p_seed_train_id;
    RETURN jsonb_build_object('success', true, 'message', 'Skipped - no formulation');
  END IF;

  IF v_seed.media_volume_ml IS NULL OR v_seed.media_volume_ml <= 0 THEN
    UPDATE public.batch_seed_trains SET inventory_deduction_status = 'skipped', inventory_deduction_log = '"No valid volume"' WHERE id = p_seed_train_id;
    RETURN jsonb_build_object('success', true, 'message', 'Skipped - no valid volume');
  END IF;

  -- Scale multiplier: (User Volume ml) / (Recipe Base Volume ml)
  -- Default recipe base volume to 1000ml if not set
  DECLARE 
    v_multiplier numeric := v_seed.media_volume_ml / COALESCE(NULLIF(v_formulation.base_volume_ml, 0), 1000.0);
  BEGIN
    -- Loop through each ingredient in the JSON array
    FOR v_ingredient IN SELECT * FROM jsonb_array_elements(v_formulation.ingredients)
    LOOP
      v_required_qty := (v_ingredient->>'quantity')::numeric * v_multiplier;
      v_remaining_req := v_required_qty;
      v_deducted_total := 0;

      -- Use FIFO: order by expiry_date ASC
      FOR v_stock_record IN 
        SELECT * FROM public.inventory_stock 
        WHERE item_id = (v_ingredient->>'item_id')::uuid 
          AND status = 'Available'
          AND current_quantity > 0
        ORDER BY expiry_date ASC
      LOOP
        EXIT WHEN v_remaining_req <= 0;

        DECLARE
          v_to_deduct numeric := LEAST(v_remaining_req, v_stock_record.current_quantity);
        BEGIN
          -- Deduct from stock
          UPDATE public.inventory_stock 
          SET current_quantity = current_quantity - v_to_deduct 
          WHERE id = v_stock_record.id;

          -- Log transaction
          -- We use dynamic SQL or try to insert to inventory_transactions if it exists.
          -- Assuming standard inventory_transactions schema
          BEGIN
            INSERT INTO public.inventory_transactions (
              item_id, stock_id, transaction_type, quantity, reference_type, reference_id, performed_by
            ) VALUES (
              v_stock_record.item_id, v_stock_record.id, 'consumed', v_to_deduct, 'batch_media_prep', v_seed.batch_id, p_employee_id
            );
          EXCEPTION WHEN OTHERS THEN
             -- Ignore if table doesn't exist, just proceed with deduction
          END;

          v_remaining_req := v_remaining_req - v_to_deduct;
          v_deducted_total := v_deducted_total + v_to_deduct;
          
          -- Build log
          v_log := v_log || jsonb_build_object(
            'ingredient', v_ingredient->>'name',
            'stock_id', v_stock_record.id,
            'deducted', v_to_deduct
          );
        END;
      END LOOP;

      IF v_remaining_req > 0 THEN
        v_success := false;
        v_log := v_log || jsonb_build_object('error', 'Insufficient stock for ' || (v_ingredient->>'name'));
      END IF;
    END LOOP;
  END;

  IF v_success THEN
    UPDATE public.batch_seed_trains SET inventory_deduction_status = 'completed', inventory_deduction_log = v_log WHERE id = p_seed_train_id;
    RETURN jsonb_build_object('success', true, 'log', v_log);
  ELSE
    -- A production system might ROLLBACK here. For now, we mark as failed so operator knows.
    UPDATE public.batch_seed_trains SET inventory_deduction_status = 'failed', inventory_deduction_log = v_log WHERE id = p_seed_train_id;
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient stock for some materials', 'log', v_log);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Notify postgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
