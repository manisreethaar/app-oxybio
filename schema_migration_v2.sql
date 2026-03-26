-- ============================================================
-- OxyOS — Full Schema Migration v2
-- Run this entire script in Supabase SQL Editor
-- Safe to run multiple times (uses IF NOT EXISTS / ON CONFLICT)
-- ============================================================


-- ==================================================
-- SECTION 1: BATCHES TABLE — Add missing columns
-- ==================================================

-- Add formulation_id reference (links to approved recipe)
ALTER TABLE batches ADD COLUMN IF NOT EXISTS formulation_id UUID REFERENCES formulations(id);

-- Add equipment_id reference
ALTER TABLE batches ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES equipment(id);

-- Add current_stage for stage progression system
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'media_prep';

-- Add created_by to track who started the batch
ALTER TABLE batches ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES employees(id);

-- Update status constraint to include 'planned'
-- (batches are created as 'planned' before they start)
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_status_check;
ALTER TABLE batches ADD CONSTRAINT batches_status_check
  CHECK (status IN ('planned', 'fermenting', 'qc-hold', 'released', 'rejected', 'deviation'));

-- Set existing batches without a status to 'fermenting' (safe default)
UPDATE batches SET status = 'fermenting' WHERE status IS NULL;
UPDATE batches SET current_stage = 'media_prep' WHERE current_stage IS NULL;


-- ==================================================
-- SECTION 2: TASKS TABLE — Add missing columns
-- ==================================================
-- (checklist, approval_status, proof_url, time_started_at, logged_minutes
--  already added by tasks_upgrade.sql — these add the batch link)

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_personal_reminder BOOLEAN DEFAULT false;


-- ==================================================
-- SECTION 3: INVENTORY MOVEMENTS TABLE — Create it
-- Tracks every stock deduction/receipt for full audit trail
-- ==================================================

CREATE TABLE IF NOT EXISTS inventory_movements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_id          UUID REFERENCES inventory_stock(id),
    movement_type     TEXT NOT NULL, -- 'Receive' | 'Issue' | 'Batch Deduction' | 'Adjustment'
    quantity          NUMERIC NOT NULL,
    batch_reference   TEXT,          -- e.g. 'BTCH-RCP-AB12'
    issued_by         UUID REFERENCES employees(id),
    notes             TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- Admins can do everything on movements
DROP POLICY IF EXISTS admin_all_inventory_movements ON inventory_movements;
CREATE POLICY admin_all_inventory_movements
  ON inventory_movements FOR ALL USING (is_admin());

-- Staff can insert and select their own movements
DROP POLICY IF EXISTS staff_insert_inventory_movements ON inventory_movements;
CREATE POLICY staff_insert_inventory_movements
  ON inventory_movements FOR INSERT WITH CHECK (issued_by = auth_employee_id());

DROP POLICY IF EXISTS staff_select_inventory_movements ON inventory_movements;
CREATE POLICY staff_select_inventory_movements
  ON inventory_movements FOR SELECT USING (true); -- everyone can read movement history


-- ==================================================
-- SECTION 4: LAB NOTEBOOK ENTRIES — Add batch_id if missing
-- (Required for the auto-LNB creation on batch start)
-- ==================================================

ALTER TABLE lab_notebook_entries ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id);


-- ==================================================
-- SECTION 5: FORMULATIONS TABLE — Add status + steps
-- (Required for approved-recipe-only gate)
-- ==================================================

ALTER TABLE formulations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Draft';
ALTER TABLE formulations ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]'::jsonb;
ALTER TABLE formulations ADD COLUMN IF NOT EXISTS code TEXT;

-- Set existing formulations to 'Draft' if no status
UPDATE formulations SET status = 'Draft' WHERE status IS NULL;
UPDATE formulations SET steps = '[]'::jsonb WHERE steps IS NULL;

-- Add status constraint
ALTER TABLE formulations DROP CONSTRAINT IF EXISTS formulations_status_check;
ALTER TABLE formulations ADD CONSTRAINT formulations_status_check
  CHECK (status IN ('Draft', 'In Review', 'Approved', 'Archived'));


-- ==================================================
-- SECTION 6: INVENTORY STOCK — Add min_stock_level
-- (Required for low-stock alerts in dashboard)
-- ==================================================

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS min_stock_level NUMERIC DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS storage_condition TEXT;

-- Add a 'status' column to inventory_stock if not present
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Available';


-- ==================================================
-- SECTION 7: STAGE TRANSITIONS TABLE
-- Records every stage advance for audit trail
-- ==================================================

CREATE TABLE IF NOT EXISTS stage_transitions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id     UUID REFERENCES batches(id),
    from_stage   TEXT,
    to_stage     TEXT,
    transitioned_by UUID REFERENCES employees(id),
    notes        TEXT,
    created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stage_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_stage_transitions ON stage_transitions;
CREATE POLICY admin_all_stage_transitions
  ON stage_transitions FOR ALL USING (is_admin());

DROP POLICY IF EXISTS staff_insert_stage_transitions ON stage_transitions;
CREATE POLICY staff_insert_stage_transitions
  ON stage_transitions FOR INSERT WITH CHECK (transitioned_by = auth_employee_id());

DROP POLICY IF EXISTS staff_select_stage_transitions ON stage_transitions;
CREATE POLICY staff_select_stage_transitions
  ON stage_transitions FOR SELECT USING (true);


-- ==================================================
-- SECTION 8: INVENTORY USAGE TABLE
-- Links specific stock lots to a batch (traceability)
-- ==================================================

CREATE TABLE IF NOT EXISTS inventory_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID REFERENCES batches(id),
    stock_id        UUID REFERENCES inventory_stock(id),
    quantity_used   NUMERIC NOT NULL,
    logged_by       UUID REFERENCES employees(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE inventory_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_inventory_usage ON inventory_usage;
CREATE POLICY admin_all_inventory_usage
  ON inventory_usage FOR ALL USING (is_admin());

DROP POLICY IF EXISTS staff_select_inventory_usage ON inventory_usage;
CREATE POLICY staff_select_inventory_usage
  ON inventory_usage FOR SELECT USING (true);

DROP POLICY IF EXISTS staff_insert_inventory_usage ON inventory_usage;
CREATE POLICY staff_insert_inventory_usage
  ON inventory_usage FOR INSERT WITH CHECK (logged_by = auth_employee_id());


-- ==================================================
-- SECTION 9: LAB LOGS TABLE
-- Stores non-pH parameter logs (stage-level CCP data)
-- ==================================================

CREATE TABLE IF NOT EXISTS lab_logs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id         UUID REFERENCES batches(id),
    process_type     TEXT,             -- e.g. 'sterilisation', 'harvest'
    parameter_name   TEXT,             -- e.g. 'Autoclave Temp'
    parameter_value  NUMERIC,
    notes            TEXT,
    logged_by        UUID REFERENCES employees(id),
    created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lab_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_lab_logs ON lab_logs;
CREATE POLICY admin_all_lab_logs
  ON lab_logs FOR ALL USING (is_admin());

DROP POLICY IF EXISTS staff_insert_lab_logs ON lab_logs;
CREATE POLICY staff_insert_lab_logs
  ON lab_logs FOR INSERT WITH CHECK (logged_by = auth_employee_id());

DROP POLICY IF EXISTS staff_select_lab_logs ON lab_logs;
CREATE POLICY staff_select_lab_logs
  ON lab_logs FOR SELECT USING (true);


-- ==================================================
-- SECTION 10: STORAGE BUCKETS
-- For document uploads (CoA, SDS, LNB images)
-- ==================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('inventory-docs', 'inventory-docs', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('lab-notebook-files', 'lab-notebook-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for inventory docs
DROP POLICY IF EXISTS "Public read inventory-docs" ON storage.objects;
CREATE POLICY "Public read inventory-docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'inventory-docs');

DROP POLICY IF EXISTS "Auth upload inventory-docs" ON storage.objects;
CREATE POLICY "Auth upload inventory-docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'inventory-docs' AND auth.role() = 'authenticated');

-- Storage policies for lab notebook files
DROP POLICY IF EXISTS "Public read lab-notebook-files" ON storage.objects;
CREATE POLICY "Public read lab-notebook-files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lab-notebook-files');

DROP POLICY IF EXISTS "Auth upload lab-notebook-files" ON storage.objects;
CREATE POLICY "Auth upload lab-notebook-files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lab-notebook-files' AND auth.role() = 'authenticated');


-- ==================================================
-- DONE
-- ==================================================
SELECT 'OxyOS schema migration v2 complete.' AS status;
