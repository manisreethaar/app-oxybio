-- ============================================================
-- OxyOS — Batch Monitoring v3 Migration
-- Run this entire script in Supabase SQL Editor
-- Safe: uses CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS
-- ============================================================

-- ── 1. EXTEND BATCHES TABLE ──────────────────────────────────

ALTER TABLE batches ADD COLUMN IF NOT EXISTS experiment_type TEXT
  CHECK (experiment_type IN ('F1', 'F2', 'PROTO', 'SHELF'));

ALTER TABLE batches ADD COLUMN IF NOT EXISTS sku_target TEXT
  CHECK (sku_target IN ('CLARITY', 'MOMENTUM', 'VITALITY', 'Unassigned'));

ALTER TABLE batches ADD COLUMN IF NOT EXISTS planned_volume_ml NUMERIC;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS num_flasks INTEGER DEFAULT 3;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS assigned_team UUID[] DEFAULT '{}';
ALTER TABLE batches ADD COLUMN IF NOT EXISTS linked_sops TEXT[];
ALTER TABLE batches ADD COLUMN IF NOT EXISTS planned_start_date DATE;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS bmr_url TEXT;

-- Update status constraint to include 'scheduled' and 'in_progress'
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_status_check;
ALTER TABLE batches ADD CONSTRAINT batches_status_check
  CHECK (status IN (
    'scheduled', 'planned', 'in_progress', 'fermenting',
    'qc_hold', 'qc-hold', 'released', 'rejected', 'deviation'
  ));

-- Update current_stage to include new stages (keep old ones for legacy batches)
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_current_stage_check;
ALTER TABLE batches ADD CONSTRAINT batches_current_stage_check
  CHECK (current_stage IN (
    'media_prep', 'sterilisation', 'inoculation', 'fermentation',
    'straining', 'extract_addition', 'qc_hold',
    'harvest', 'downstream',  -- legacy — kept for existing batches
    'released', 'rejected'
  ));


-- ── 2. BATCH FLASKS ──────────────────────────────────────────
-- Tracks individual flasks within a batch (F1, F2, F3...)

CREATE TABLE IF NOT EXISTS batch_flasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         UUID REFERENCES batches(id) ON DELETE CASCADE,
  flask_label      TEXT NOT NULL,        -- 'F1', 'F2', 'F3'
  flask_full_id    TEXT NOT NULL,        -- 'OB-2026-04-001-F1'
  status           TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'rejected', 'complete')),
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE batch_flasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_batch_flasks ON batch_flasks;
CREATE POLICY admin_all_batch_flasks ON batch_flasks FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_batch_flasks ON batch_flasks;
CREATE POLICY staff_select_batch_flasks ON batch_flasks FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_insert_batch_flasks ON batch_flasks;
CREATE POLICY staff_insert_batch_flasks ON batch_flasks FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS staff_update_batch_flasks ON batch_flasks;
CREATE POLICY staff_update_batch_flasks ON batch_flasks FOR UPDATE USING (true);


-- ── 3. MEDIA PREPARATION ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS batch_stage_media_prep (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              UUID REFERENCES batches(id) ON DELETE CASCADE,
  stage_start_time      TIMESTAMPTZ,
  -- Ragi (always present)
  ragi_lot_id           UUID REFERENCES inventory_stock(id),
  ragi_weight_g         NUMERIC,
  ragi_moisture_pass    BOOLEAN,         -- NULL = not checked, true = pass, false = fail
  -- Karuppu Kavuni (F2 only)
  kavuni_lot_id         UUID REFERENCES inventory_stock(id),
  kavuni_weight_g       NUMERIC,
  kavuni_soak_start     TIMESTAMPTZ,
  kavuni_precook_temp_c NUMERIC(5,2),
  kavuni_precook_min    NUMERIC,
  -- Common
  water_volume_ml       NUMERIC,
  total_volume_ml       NUMERIC,
  initial_ph            NUMERIC(4,2),
  is_complete           BOOLEAN DEFAULT false,
  operator_id           UUID REFERENCES employees(id),
  supervised_by         UUID REFERENCES employees(id),  -- required for intern entries
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(batch_id)
);

ALTER TABLE batch_stage_media_prep ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_media_prep ON batch_stage_media_prep;
CREATE POLICY admin_all_media_prep ON batch_stage_media_prep FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_media_prep ON batch_stage_media_prep;
CREATE POLICY staff_select_media_prep ON batch_stage_media_prep FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_insert_media_prep ON batch_stage_media_prep;
CREATE POLICY staff_insert_media_prep ON batch_stage_media_prep FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS staff_update_media_prep ON batch_stage_media_prep;
CREATE POLICY staff_update_media_prep ON batch_stage_media_prep FOR UPDATE USING (true);


-- ── 4. STERILISATION ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS batch_stage_sterilisation (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         UUID REFERENCES batches(id) ON DELETE CASCADE,
  stage_start_time TIMESTAMPTZ,
  method           TEXT CHECK (method IN ('Autoclave', 'Pressure Cooker', 'Dry Heat', 'Other')),
  equipment_id     UUID REFERENCES equipment(id),
  cycle_temp_c     NUMERIC(5,2),
  cycle_pressure   TEXT,               -- free text: "15 psi" / "1 bar" (Phase 0 no data logger)
  hold_time_min    NUMERIC,
  cycle_start      TIMESTAMPTZ,
  cycle_end        TIMESTAMPTZ,
  autoclave_tape   TEXT CHECK (autoclave_tape IN ('Positive', 'Negative')),
  pass_fail        TEXT CHECK (pass_fail IN ('Pass', 'Fail', 'Pending')) DEFAULT 'Pending',
  operator_id      UUID REFERENCES employees(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(batch_id)
);

ALTER TABLE batch_stage_sterilisation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_steril ON batch_stage_sterilisation;
CREATE POLICY admin_all_steril ON batch_stage_sterilisation FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_steril ON batch_stage_sterilisation;
CREATE POLICY staff_select_steril ON batch_stage_sterilisation FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_insert_steril ON batch_stage_sterilisation;
CREATE POLICY staff_insert_steril ON batch_stage_sterilisation FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS staff_update_steril ON batch_stage_sterilisation;
CREATE POLICY staff_update_steril ON batch_stage_sterilisation FOR UPDATE USING (true);


-- ── 5. INOCULATION ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS batch_stage_inoculation (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              UUID REFERENCES batches(id) ON DELETE CASCADE,
  stage_start_time      TIMESTAMPTZ,
  inoculum_type         TEXT CHECK (inoculum_type IN (
    'Fresh Curd', 'Back-slop', 'Pure Lactobacillus Isolate'
  )),
  backslop_source_batch UUID REFERENCES batches(id),   -- if Back-slop
  inoculum_source_notes TEXT,                           -- curd date or isolate ID
  inoculum_vol_ml       NUMERIC,
  inoculation_pct       NUMERIC(5,2),                  -- auto-calc: stored on save
  inoculation_temp_c    NUMERIC(5,2),
  t_zero_time           TIMESTAMPTZ,                   -- *** FERMENTATION ANCHOR T=0 ***
  transfer_method       TEXT CHECK (transfer_method IN ('Pipette', 'Syringe', 'Sterile spoon')),
  laf_used              BOOLEAN DEFAULT false,
  contamination_check   TEXT CHECK (contamination_check IN ('Clear', 'Suspected')) DEFAULT 'Clear',
  contamination_notes   TEXT,
  lnb_entry_id          UUID REFERENCES lab_notebook_entries(id),
  operator_id           UUID REFERENCES employees(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(batch_id)
);

ALTER TABLE batch_stage_inoculation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_inocu ON batch_stage_inoculation;
CREATE POLICY admin_all_inocu ON batch_stage_inoculation FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_inocu ON batch_stage_inoculation;
CREATE POLICY staff_select_inocu ON batch_stage_inoculation FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_insert_inocu ON batch_stage_inoculation;
CREATE POLICY staff_insert_inocu ON batch_stage_inoculation FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS staff_update_inocu ON batch_stage_inoculation;
CREATE POLICY staff_update_inocu ON batch_stage_inoculation FOR UPDATE USING (true);


-- ── 6. FERMENTATION READINGS (flask-level time-series) ───────

CREATE TABLE IF NOT EXISTS batch_fermentation_readings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          UUID REFERENCES batches(id) ON DELETE CASCADE,
  flask_id          UUID REFERENCES batch_flasks(id),
  flask_label       TEXT,               -- denormalised for fast display
  logged_at         TIMESTAMPTZ DEFAULT now(),
  elapsed_hours     NUMERIC,            -- calculated from T=0 and stored
  ph                NUMERIC(4,2),
  incubator_temp_c  NUMERIC(5,2),
  foam_level        TEXT CHECK (foam_level IN ('None', 'Slight', 'Moderate', 'Heavy')),
  visual_appearance TEXT CHECK (visual_appearance IN (
    'Normal', 'Colour change', 'Turbidity change', 'Separation observed'
  )),
  is_ph_alarm       BOOLEAN DEFAULT false,   -- auto-set: pH outside 3.8–5.5
  is_temp_alarm     BOOLEAN DEFAULT false,   -- auto-set: temp outside 36–38°C
  logged_by         UUID REFERENCES employees(id),
  supervised_by     UUID REFERENCES employees(id),  -- required for intern entries
  is_retrospective  BOOLEAN DEFAULT false,
  retro_reason      TEXT,
  notes             TEXT
);

-- Trigger: auto-flag alarms on insert/update
CREATE OR REPLACE FUNCTION flag_fermentation_alarms()
RETURNS TRIGGER AS $$
BEGIN
  -- Mid-fermentation pH watch range: 3.8–5.5 (endpoint target 4.2–4.5 is checked at declaration)
  NEW.is_ph_alarm   := (NEW.ph IS NOT NULL AND (NEW.ph < 3.8 OR NEW.ph > 5.5));
  -- Incubator temp: acceptable 36–38°C
  NEW.is_temp_alarm := (NEW.incubator_temp_c IS NOT NULL AND (NEW.incubator_temp_c < 36 OR NEW.incubator_temp_c > 38));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_flag_fermentation_alarms ON batch_fermentation_readings;
CREATE TRIGGER trg_flag_fermentation_alarms
BEFORE INSERT OR UPDATE ON batch_fermentation_readings
FOR EACH ROW EXECUTE FUNCTION flag_fermentation_alarms();

ALTER TABLE batch_fermentation_readings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_ferm_readings ON batch_fermentation_readings;
CREATE POLICY admin_all_ferm_readings ON batch_fermentation_readings FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_ferm_readings ON batch_fermentation_readings;
CREATE POLICY staff_select_ferm_readings ON batch_fermentation_readings FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_insert_ferm_readings ON batch_fermentation_readings;
CREATE POLICY staff_insert_ferm_readings ON batch_fermentation_readings FOR INSERT WITH CHECK (true);


-- ── 7. FERMENTATION ENDPOINT DECLARATION ─────────────────────
-- Separate from readings — filed once when operator declares fermentation complete

CREATE TABLE IF NOT EXISTS batch_fermentation_endpoint (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           UUID REFERENCES batches(id) ON DELETE CASCADE,
  declared_at        TIMESTAMPTZ DEFAULT now(),
  declared_by        UUID REFERENCES employees(id),
  total_hours        NUMERIC,           -- auto-calc from T=0 → declaration time
  final_ph           NUMERIC(4,2),
  ph_out_of_range    BOOLEAN DEFAULT false,
  ph_override_reason TEXT,              -- required if pH outside 4.2–4.5
  -- Sensory evaluation
  aroma              TEXT CHECK (aroma IN ('Tangy and clean', 'Mild', 'Off-odour detected')),
  colour_desc        TEXT,
  texture            TEXT CHECK (texture IN ('Normal slurry', 'Over-separated', 'Clumped')),
  sensory_overall    TEXT CHECK (sensory_overall IN ('PASS', 'FAIL')),
  sensory_by         UUID REFERENCES employees(id),
  gram_stain         TEXT CHECK (gram_stain IN (
    'Gram-positive rods dominant', 'Mixed', 'Gram-negative dominant', 'Not done'
  )),
  notes              TEXT,
  UNIQUE(batch_id)
);

ALTER TABLE batch_fermentation_endpoint ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_ferm_ep ON batch_fermentation_endpoint;
CREATE POLICY admin_all_ferm_ep ON batch_fermentation_endpoint FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_ferm_ep ON batch_fermentation_endpoint;
CREATE POLICY staff_select_ferm_ep ON batch_fermentation_endpoint FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_insert_ferm_ep ON batch_fermentation_endpoint;
CREATE POLICY staff_insert_ferm_ep ON batch_fermentation_endpoint FOR INSERT WITH CHECK (true);


-- ── 8. PER-FLASK ENDPOINT DISPOSITION ────────────────────────
-- Each flask is individually approved/rejected at endpoint declaration

CREATE TABLE IF NOT EXISTS batch_flask_endpoints (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id      UUID REFERENCES batch_fermentation_endpoint(id) ON DELETE CASCADE,
  flask_id         UUID REFERENCES batch_flasks(id),
  flask_label      TEXT,
  disposition      TEXT CHECK (disposition IN ('PROCEED', 'REJECT THIS FLASK')),
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE batch_flask_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_flask_ep ON batch_flask_endpoints;
CREATE POLICY admin_all_flask_ep ON batch_flask_endpoints FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_flask_ep ON batch_flask_endpoints;
CREATE POLICY staff_select_flask_ep ON batch_flask_endpoints FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_insert_flask_ep ON batch_flask_endpoints;
CREATE POLICY staff_insert_flask_ep ON batch_flask_endpoints FOR INSERT WITH CHECK (true);


-- ── 9. STRAINING / SEPARATION ────────────────────────────────

CREATE TABLE IF NOT EXISTS batch_stage_straining (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              UUID REFERENCES batches(id) ON DELETE CASCADE,
  stage_start_time      TIMESTAMPTZ,
  method                TEXT CHECK (method IN ('Muslin cloth', 'Filter paper', 'Combined')),
  pre_straining_vol_ml  NUMERIC,
  post_straining_vol_ml NUMERIC,
  recovery_pct          NUMERIC(5,2),   -- auto-calculated: (post/pre)*100, stored
  straining_temp        TEXT CHECK (straining_temp IN ('Room temp', 'Cold (refrigerated)')),
  filtrate_colour       TEXT,
  filtrate_clarity      TEXT CHECK (filtrate_clarity IN ('Clear', 'Slightly turbid', 'Turbid')),
  filtrate_ph           NUMERIC(4,2),
  flask_volumes         JSONB DEFAULT '[]'::jsonb,  -- [{flask_label, pre_ml, post_ml}]
  operator_id           UUID REFERENCES employees(id),
  supervised_by         UUID REFERENCES employees(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(batch_id)
);

ALTER TABLE batch_stage_straining ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_straining ON batch_stage_straining;
CREATE POLICY admin_all_straining ON batch_stage_straining FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_straining ON batch_stage_straining;
CREATE POLICY staff_select_straining ON batch_stage_straining FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_insert_straining ON batch_stage_straining;
CREATE POLICY staff_insert_straining ON batch_stage_straining FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS staff_update_straining ON batch_stage_straining;
CREATE POLICY staff_update_straining ON batch_stage_straining FOR UPDATE USING (true);


-- ── 10. MUSHROOM EXTRACT ADDITION ────────────────────────────

CREATE TABLE IF NOT EXISTS batch_stage_extract_addition (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                UUID REFERENCES batches(id) ON DELETE CASCADE,
  stage_start_time        TIMESTAMPTZ,
  mushroom_species        TEXT CHECK (mushroom_species IN (
    'Lion''s Mane', 'Cordyceps militaris', 'Reishi'
  )),
  mushroom_lot_id         UUID REFERENCES inventory_stock(id),
  mushroom_weight_g       NUMERIC,
  extraction_water_ml     NUMERIC,
  extraction_temp_c       NUMERIC(5,2),
  extraction_duration_min NUMERIC,
  extract_recovered_ml    NUMERIC,
  extract_ph              NUMERIC(4,2),
  ph_adjustment_done      BOOLEAN DEFAULT false,
  ph_adjustment_notes     TEXT,
  extract_vol_added_ml    NUMERIC,
  addition_pct            NUMERIC(5,2),   -- (extract_vol / post_straining_vol) * 100
  final_product_ph        NUMERIC(4,2),   -- *** GATE FIELD — must be recorded ***
  ph_above_5_override_by  UUID REFERENCES employees(id),  -- CEO confirmation if pH > 5.0
  colour_before           TEXT,
  colour_after            TEXT,
  addition_temp           TEXT CHECK (addition_temp IN ('Cold base (<10°C)', 'Room temp')),
  addition_method         TEXT CHECK (addition_method IN ('Dropwise', 'Slow pour')),
  laf_used                BOOLEAN DEFAULT false,
  operator_id             UUID REFERENCES employees(id),
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE(batch_id)
);

ALTER TABLE batch_stage_extract_addition ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_extract ON batch_stage_extract_addition;
CREATE POLICY admin_all_extract ON batch_stage_extract_addition FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_extract ON batch_stage_extract_addition;
CREATE POLICY staff_select_extract ON batch_stage_extract_addition FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_insert_extract ON batch_stage_extract_addition;
CREATE POLICY staff_insert_extract ON batch_stage_extract_addition FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS staff_update_extract ON batch_stage_extract_addition;
CREATE POLICY staff_update_extract ON batch_stage_extract_addition FOR UPDATE USING (true);


-- ── 11. QC HOLD — SAMPLE RECORD ──────────────────────────────

CREATE TABLE IF NOT EXISTS batch_qc_samples (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          UUID REFERENCES batches(id) ON DELETE CASCADE,
  sample_id         TEXT UNIQUE,      -- QCS-2026-04-001 (auto-generated in API)
  sampling_date     DATE DEFAULT CURRENT_DATE,
  sampling_operator UUID REFERENCES employees(id),
  vol_per_flask_ml  NUMERIC,
  testing_location  TEXT CHECK (testing_location IN ('In-house', 'NABL external lab')),
  external_lab      TEXT,
  ext_ref_number    TEXT,
  sample_sent_date  DATE,
  expected_date     DATE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(batch_id)
);

ALTER TABLE batch_qc_samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_qc_samples ON batch_qc_samples;
CREATE POLICY admin_all_qc_samples ON batch_qc_samples FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_qc_samples ON batch_qc_samples;
CREATE POLICY staff_select_qc_samples ON batch_qc_samples FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_insert_qc_samples ON batch_qc_samples;
CREATE POLICY staff_insert_qc_samples ON batch_qc_samples FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS staff_update_qc_samples ON batch_qc_samples;
CREATE POLICY staff_update_qc_samples ON batch_qc_samples FOR UPDATE USING (true);


-- ── 12. QC HOLD — PER-TEST RESULTS ───────────────────────────

CREATE TABLE IF NOT EXISTS batch_qc_tests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id     UUID REFERENCES batch_qc_samples(id) ON DELETE CASCADE,
  batch_id      UUID REFERENCES batches(id),
  test_name     TEXT NOT NULL,
  sop_id        UUID REFERENCES sop_library(id),
  target_spec   TEXT,
  result_value  TEXT,
  result_unit   TEXT,
  pass_fail     TEXT CHECK (pass_fail IN ('Pass', 'Fail', 'Pending', 'N/A')) DEFAULT 'Pending',
  coa_url       TEXT,
  tested_by     TEXT,
  tested_at     DATE,
  capa_id       UUID,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE batch_qc_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_qc_tests ON batch_qc_tests;
CREATE POLICY admin_all_qc_tests ON batch_qc_tests FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_qc_tests ON batch_qc_tests;
CREATE POLICY staff_select_qc_tests ON batch_qc_tests FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_insert_qc_tests ON batch_qc_tests;
CREATE POLICY staff_insert_qc_tests ON batch_qc_tests FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS staff_update_qc_tests ON batch_qc_tests;
CREATE POLICY staff_update_qc_tests ON batch_qc_tests FOR UPDATE USING (true);


-- ── 13. RELEASE RECORD ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS batch_release_record (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          UUID REFERENCES batches(id) ON DELETE CASCADE,
  released_by       UUID REFERENCES employees(id),   -- CEO only (enforced at API level)
  released_at       TIMESTAMPTZ DEFAULT now(),
  final_volume_ml   NUMERIC,
  storage_condition TEXT CHECK (storage_condition IN ('2-8°C', 'Below -18°C', 'Ambient (15-25°C)')),
  storage_location  TEXT,
  release_notes     TEXT,
  bmr_url           TEXT,         -- PDF generated + stored in Document Vault
  shelf_life_id     UUID,         -- FK to shelf_life record (created on release)
  UNIQUE(batch_id)
);

ALTER TABLE batch_release_record ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_release ON batch_release_record;
CREATE POLICY admin_all_release ON batch_release_record FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_release ON batch_release_record;
CREATE POLICY staff_select_release ON batch_release_record FOR SELECT USING (true);


-- ── 14. REJECTION RECORD ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS batch_rejection_record (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         UUID REFERENCES batches(id) ON DELETE CASCADE,
  rejected_by      UUID REFERENCES employees(id),   -- CEO only
  rejected_at      TIMESTAMPTZ DEFAULT now(),
  rejection_reason TEXT NOT NULL,
  rejection_stage  TEXT,            -- which stage it failed at (for trend analysis)
  disposal_method  TEXT CHECK (disposal_method IN (
    'Autoclave + Drain', 'Incineration', 'Return for reprocessing', 'Other'
  )),
  write_off_vol_ml NUMERIC,
  capa_required    BOOLEAN DEFAULT false,
  capa_id          UUID,
  notes            TEXT,
  UNIQUE(batch_id)
);

ALTER TABLE batch_rejection_record ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_rejection ON batch_rejection_record;
CREATE POLICY admin_all_rejection ON batch_rejection_record FOR ALL USING (is_admin());
DROP POLICY IF EXISTS staff_select_rejection ON batch_rejection_record;
CREATE POLICY staff_select_rejection ON batch_rejection_record FOR SELECT USING (true);


-- ── DONE ──────────────────────────────────────────────────────
SELECT 'Batch Monitoring v3 migration complete — 13 stage tables + batch extensions created.' AS status;
