-- ============================================================
-- OxyOS — Unified Data Model Migration
-- Implements complete traceability linking batches, inventory,
-- equipment, LNB, SOPs, Tasks, and CAPA.
-- ============================================================

-- ── 1. BATCH ↔ SAMPLE INCUBATION ────────────────────────────
-- Link samples to specific flasks and QC samples.
ALTER TABLE sample_incubation_records 
  ADD COLUMN IF NOT EXISTS flask_id UUID REFERENCES batch_flasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS batch_stage TEXT,
  ADD COLUMN IF NOT EXISTS qc_sample_id UUID REFERENCES batch_flask_qc_samples(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sampled_at TIMESTAMPTZ;

-- ── 2. BATCH ↔ INVENTORY ────────────────────────────────────
-- Add lot-level traceability down to the flask and stage.
ALTER TABLE inventory_usage 
  ADD COLUMN IF NOT EXISTS flask_id UUID REFERENCES batch_flasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS stage TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ── 3. BATCH ↔ EQUIPMENT ────────────────────────────────────
-- Expand equipment traceability beyond sterilisation.
ALTER TABLE batch_stage_media_prep 
  ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES equipment(id);

ALTER TABLE batch_fermentation_readings 
  ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES equipment(id);

ALTER TABLE batch_flask_straining 
  ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES equipment(id);

ALTER TABLE sample_incubation_records
  ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES equipment(id);

-- ── 4. BATCH ↔ LAB NOTEBOOK (LNB) ───────────────────────────
-- Link LNB entries to flask, stage, and sample level.
ALTER TABLE lab_notebook_entries 
  ADD COLUMN IF NOT EXISTS flask_id UUID REFERENCES batch_flasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS stage_name TEXT,
  ADD COLUMN IF NOT EXISTS sample_id UUID REFERENCES sample_incubation_records(id);

-- ── 5. BATCH ↔ SOP TRAINING ─────────────────────────────────
-- Link required SOPs to tasks and critical batch stages.
ALTER TABLE tasks 
  ADD COLUMN IF NOT EXISTS sop_id UUID REFERENCES sop_library(id);

ALTER TABLE batch_stage_media_prep 
  ADD COLUMN IF NOT EXISTS sop_id UUID REFERENCES sop_library(id);

ALTER TABLE batch_stage_sterilisation 
  ADD COLUMN IF NOT EXISTS sop_id UUID REFERENCES sop_library(id);

ALTER TABLE batch_flask_extract_addition 
  ADD COLUMN IF NOT EXISTS sop_id UUID REFERENCES sop_library(id);

-- ── 6. DEVIATIONS / CAPA ↔ EVERYTHING ───────────────────────
-- Make deviations the central investigation hub.
ALTER TABLE deviations
  ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES equipment(id),
  ADD COLUMN IF NOT EXISTS inventory_stock_id UUID REFERENCES inventory_stock(id),
  ADD COLUMN IF NOT EXISTS sample_incubation_id UUID REFERENCES sample_incubation_records(id),
  ADD COLUMN IF NOT EXISTS sop_id UUID REFERENCES sop_library(id),
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id),
  ADD COLUMN IF NOT EXISTS flask_id UUID REFERENCES batch_flasks(id) ON DELETE CASCADE;

-- ── 7. TASKS ↔ OPERATIONAL RECORDS ──────────────────────────
-- Allow tasks to trace back to any entity.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES equipment(id),
  ADD COLUMN IF NOT EXISTS capa_action_id UUID REFERENCES capa_actions(id),
  ADD COLUMN IF NOT EXISTS sop_acknowledgement_id UUID REFERENCES sop_acknowledgements(id),
  ADD COLUMN IF NOT EXISTS inventory_stock_id UUID REFERENCES inventory_stock(id),
  ADD COLUMN IF NOT EXISTS leave_application_id UUID REFERENCES leave_applications(id);

-- ── 8. SHELF-LIFE ↔ BATCH RELEASE ↔ QC ──────────────────────
-- Enable stability trend and formulation tracking.
ALTER TABLE shelf_life_studies
  ADD COLUMN IF NOT EXISTS release_record_id UUID REFERENCES batch_flask_release_record(id),
  ADD COLUMN IF NOT EXISTS formulation_id UUID REFERENCES formulations(id),
  ADD COLUMN IF NOT EXISTS packaging_lot_id UUID REFERENCES inventory_stock(id);

-- ── 9. FORMULATIONS ↔ INVENTORY ↔ BATCH (BOM CHAIN) ─────────
-- Formal BOM mapping formulations to actual inventory items.
CREATE TABLE IF NOT EXISTS formulation_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    formulation_id UUID REFERENCES formulations(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES inventory_items(id),
    quantity NUMERIC NOT NULL,
    unit TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE formulation_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_formulation_ingredients ON formulation_ingredients;
CREATE POLICY admin_all_formulation_ingredients ON formulation_ingredients FOR ALL USING (is_admin());

DROP POLICY IF EXISTS staff_select_formulation_ingredients ON formulation_ingredients;
CREATE POLICY staff_select_formulation_ingredients ON formulation_ingredients FOR SELECT USING (true);

-- ── 10. ATTENDANCE / LEAVE ↔ TASKS ──────────────────────────
-- Link employee availability to operational tasks.
ALTER TABLE attendance_log 
  ADD COLUMN IF NOT EXISTS linked_task_ids UUID[] DEFAULT '{}';

ALTER TABLE leave_applications 
  ADD COLUMN IF NOT EXISTS reassigned_task_ids UUID[] DEFAULT '{}';

-- ── DONE ────────────────────────────────────────────────────
SELECT 'Unified Data Model Migration completed successfully.' AS status;
