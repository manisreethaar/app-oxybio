-- Inventory Module — Full GDP / ALCOA++ Remediation
--
-- Closes the gaps identified in the compliance audit of the Inventory module:
--   Attributable   — inventory_stock/inventory_items/vendors had no `updated_by`,
--                     so direct edits left no record of WHO changed a value.
--   Contemporaneous — none of those tables had `updated_at`.
--   Original        — inventory_items and vendors were not wired into the
--                     existing system_audit_logs trigger (inventory_stock was,
--                     but its `changed_by` always came back NULL because the
--                     trigger only recognised `updated_by`, which didn't exist).
--   Enduring        — vendors had no soft-delete column, so removing a vendor
--                     was a hard, unrecoverable DELETE.

-- 1. Attributable + Contemporaneous: updated_by / updated_at on the three
--    inventory tables that allow direct edits.
ALTER TABLE inventory_stock
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES employees(id);

-- 2. Auto-stamp updated_at on every UPDATE (application code is still
--    responsible for setting updated_by, since that requires knowing which
--    employee is making the request).
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['inventory_stock', 'inventory_items', 'vendors'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at_%I ON %I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_set_updated_at_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();', t, t);
  END LOOP;
END;
$$;

-- 3. Wire inventory_items and vendors into the existing generic audit-log
--    trigger (system_audit_logs) alongside inventory_stock, so every INSERT/
--    UPDATE/DELETE on any of the three keeps a full before/after JSON
--    snapshot, attributed via the `updated_by` column added above.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['inventory_items', 'vendors'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON %I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_func();', t, t);
  END LOOP;
END;
$$;

-- 4. GDP "reasoned correction" RPC for inventory_stock — a single function
--    (one DB transaction) that records the correction reason via
--    set_audit_reason's app.audit_reason transaction variable AND performs
--    the update, so the audit-log trigger's `reason` column actually gets
--    populated (two separate client round-trips would land in two separate
--    transactions and the reason would be lost). Used for both the regular
--    "Edit Stock" form and QC release/reject/quarantine/CoA actions — callers
--    only pass the keys relevant to their action; everything else is a no-op
--    via COALESCE.
CREATE OR REPLACE FUNCTION update_inventory_stock_with_reason(p_id uuid, p_updates jsonb, p_reason text)
RETURNS SETOF inventory_stock AS $$
BEGIN
  PERFORM set_config('app.audit_reason', p_reason, true);

  RETURN QUERY
  UPDATE inventory_stock t SET
    vendor_id             = COALESCE((p_updates->>'vendor_id')::uuid, t.vendor_id),
    supplier_batch_number = COALESCE(p_updates->>'supplier_batch_number', t.supplier_batch_number),
    current_quantity      = COALESCE((p_updates->>'current_quantity')::numeric, t.current_quantity),
    expiry_date           = COALESCE((p_updates->>'expiry_date')::date, t.expiry_date),
    location              = COALESCE(p_updates->>'location', t.location),
    purchase_order_number = COALESCE(p_updates->>'purchase_order_number', t.purchase_order_number),
    invoice_ref           = COALESCE(p_updates->>'invoice_ref', t.invoice_ref),
    condition_on_arrival  = COALESCE(p_updates->>'condition_on_arrival', t.condition_on_arrival),
    sds_url               = COALESCE(p_updates->>'sds_url', t.sds_url),
    coa_url               = COALESCE(p_updates->>'coa_url', t.coa_url),
    notes                 = COALESCE(p_updates->>'notes', t.notes),
    status                = COALESCE(p_updates->>'status', t.status),
    qc_status             = COALESCE(p_updates->>'qc_status', t.qc_status),
    qc_released_by        = COALESCE((p_updates->>'qc_released_by')::uuid, t.qc_released_by),
    qc_released_at        = COALESCE((p_updates->>'qc_released_at')::timestamptz, t.qc_released_at),
    qc_notes              = COALESCE(p_updates->>'qc_notes', t.qc_notes),
    rejection_reason      = COALESCE(p_updates->>'rejection_reason', t.rejection_reason),
    rejected_by           = COALESCE((p_updates->>'rejected_by')::uuid, t.rejected_by),
    rejected_at           = COALESCE((p_updates->>'rejected_at')::timestamptz, t.rejected_at),
    quarantine_location   = COALESCE(p_updates->>'quarantine_location', t.quarantine_location),
    quarantine_rack       = COALESCE(p_updates->>'quarantine_rack', t.quarantine_rack),
    updated_by            = COALESCE((p_updates->>'updated_by')::uuid, t.updated_by)
  WHERE t.id = p_id
  RETURNING t.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION update_inventory_stock_with_reason(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_inventory_stock_with_reason(uuid, jsonb, text) TO authenticated;

-- 5. Same pattern for inventory_items corrections (name/category/min-stock/
--    hazard flags etc.) so item-catalogue edits also carry a recorded reason.
CREATE OR REPLACE FUNCTION update_inventory_items_with_reason(p_id uuid, p_updates jsonb, p_reason text)
RETURNS SETOF inventory_items AS $$
BEGIN
  PERFORM set_config('app.audit_reason', p_reason, true);

  RETURN QUERY
  UPDATE inventory_items t SET
    name                 = COALESCE(p_updates->>'name', t.name),
    category             = COALESCE(p_updates->>'category', t.category),
    sub_category         = COALESCE(p_updates->>'sub_category', t.sub_category),
    unit                 = COALESCE(p_updates->>'unit', t.unit),
    min_stock_level      = COALESCE((p_updates->>'min_stock_level')::numeric, t.min_stock_level),
    storage_condition    = COALESCE(p_updates->>'storage_condition', t.storage_condition),
    preferred_supplier   = COALESCE((p_updates->>'preferred_supplier')::uuid, t.preferred_supplier),
    hazardous            = COALESCE((p_updates->>'hazardous')::boolean, t.hazardous),
    cold_chain_required  = COALESCE((p_updates->>'cold_chain_required')::boolean, t.cold_chain_required),
    coa_required         = COALESCE((p_updates->>'coa_required')::boolean, t.coa_required),
    allergen             = COALESCE((p_updates->>'allergen')::boolean, t.allergen),
    organic_certified    = COALESCE(p_updates->>'organic_certified', t.organic_certified),
    item_code            = COALESCE(p_updates->>'item_code', t.item_code),
    updated_by           = COALESCE((p_updates->>'updated_by')::uuid, t.updated_by)
  WHERE t.id = p_id
  RETURNING t.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION update_inventory_items_with_reason(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_inventory_items_with_reason(uuid, jsonb, text) TO authenticated;
