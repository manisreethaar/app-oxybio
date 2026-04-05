-- ============================================================
-- OxyOS — Batch Monitoring v4 — Flask-Level Architecture
-- Run this in Supabase SQL Editor AFTER batch_monitoring_v3_migration.sql
--
-- What this fixes:
--   1. batch_flasks missing current_stage column
--   2. batch_stage_sterilisation: adds cycle_pressure_bar + expands method CHECK
--   3. Drops old batch-level endpoint tables (wrong architecture)
--   4. Creates all 8 per-flask stage tables the revamped code expects
--   5. RLS policies for all new tables
-- ============================================================

-- ── 1. ADD current_stage TO batch_flasks ─────────────────────
-- This column is the core of per-flask tracking — without it every
-- handleFlaskTransition() call silently fails.
ALTER TABLE batch_flasks
  ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'inoculation'
    CHECK (current_stage IN (
      'inoculation', 'fermentation', 'straining',
      'extract_addition', 'qc_hold', 'released', 'rejected'
    ));

-- ── 2. FIX batch_stage_sterilisation ─────────────────────────
-- Code writes cycle_pressure_bar (NUMERIC) but migration only has
-- cycle_pressure (TEXT). Add the numeric column the code uses.
ALTER TABLE batch_stage_sterilisation
  ADD COLUMN IF NOT EXISTS cycle_pressure_bar NUMERIC(6,2);

-- Expand method CHECK to include Filter + Chemical
-- (SterilisationPanel.js METHODS array has these two extra values)
ALTER TABLE batch_stage_sterilisation
  DROP CONSTRAINT IF EXISTS batch_stage_sterilisation_method_check;
ALTER TABLE batch_stage_sterilisation
  ADD CONSTRAINT batch_stage_sterilisation_method_check
    CHECK (method IN ('Autoclave', 'Pressure Cooker', 'Dry Heat', 'Filter', 'Chemical', 'Other'));

-- ── 3. DROP OLD BATCH-LEVEL ENDPOINT TABLES ──────────────────
-- The v3 migration created batch_flask_endpoints referencing
-- batch_fermentation_endpoint (batch-level).
-- The revamped code treats batch_flask_endpoints as a standalone
-- per-flask record with completely different columns.
-- DROP both and recreate batch_flask_endpoints with the right schema.
DROP TABLE IF EXISTS batch_flask_endpoints     CASCADE;
DROP TABLE IF EXISTS batch_fermentation_endpoint CASCADE;


-- ── 4. batch_flask_inoculations ──────────────────────────────
-- Per-flask. Replaces batch_stage_inoculation (which was batch-level).
-- InoculationPanel.js upserts to this with onConflict: 'flask_id'.
CREATE TABLE IF NOT EXISTS batch_flask_inoculations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flask_id                 UUID NOT NULL REFERENCES batch_flasks(id) ON DELETE CASCADE,
  batch_id                 UUID NOT NULL REFERENCES batches(id)      ON DELETE CASCADE,
  inoculum_source          TEXT,
  inoculum_vol_ml          NUMERIC,
  planned_fermentation_hrs NUMERIC,
  t_zero_time              TIMESTAMPTZ,        -- *** FERMENTATION CLOCK ANCHOR ***
  transfer_method          TEXT CHECK (transfer_method IN ('Pipette', 'Syringe', 'Sterile spoon')),
  laf_used                 BOOLEAN    DEFAULT false,
  contamination_check      TEXT CHECK (contamination_check IN ('Clear', 'Suspected')) DEFAULT 'Clear',
  contamination_notes      TEXT,
  operator_id              UUID REFERENCES employees(id),
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  UNIQUE (flask_id)
);

ALTER TABLE batch_flask_inoculations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_flask_inocu     ON batch_flask_inoculations;
DROP POLICY IF EXISTS staff_select_flask_inocu  ON batch_flask_inoculations;
DROP POLICY IF EXISTS staff_insert_flask_inocu  ON batch_flask_inoculations;
DROP POLICY IF EXISTS staff_update_flask_inocu  ON batch_flask_inoculations;
CREATE POLICY admin_all_flask_inocu     ON batch_flask_inoculations FOR ALL    USING (is_admin());
CREATE POLICY staff_select_flask_inocu  ON batch_flask_inoculations FOR SELECT USING (true);
CREATE POLICY staff_insert_flask_inocu  ON batch_flask_inoculations FOR INSERT WITH CHECK (true);
CREATE POLICY staff_update_flask_inocu  ON batch_flask_inoculations FOR UPDATE USING (true);


-- ── 5. batch_flask_endpoints ─────────────────────────────────
-- Per-flask endpoint declaration (previously mis-designed in v3).
-- FermentationPanel.js upserts with onConflict: 'flask_id'.
-- Fields: final_ph, aroma, texture, sensory_overall, gram_stain, colour_desc.
CREATE TABLE IF NOT EXISTS batch_flask_endpoints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flask_id        UUID NOT NULL REFERENCES batch_flasks(id) ON DELETE CASCADE,
  batch_id        UUID NOT NULL REFERENCES batches(id)      ON DELETE CASCADE,
  total_hours     NUMERIC,
  final_ph        NUMERIC(4,2),
  aroma           TEXT,
  colour_desc     TEXT,
  texture         TEXT,
  sensory_overall TEXT CHECK (sensory_overall IN ('PASS', 'FAIL')),
  gram_stain      TEXT,
  notes           TEXT,
  declared_by     UUID REFERENCES employees(id),
  declared_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (flask_id)
);

ALTER TABLE batch_flask_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_flask_ep     ON batch_flask_endpoints;
DROP POLICY IF EXISTS staff_select_flask_ep  ON batch_flask_endpoints;
DROP POLICY IF EXISTS staff_insert_flask_ep  ON batch_flask_endpoints;
DROP POLICY IF EXISTS staff_update_flask_ep  ON batch_flask_endpoints;
CREATE POLICY admin_all_flask_ep     ON batch_flask_endpoints FOR ALL    USING (is_admin());
CREATE POLICY staff_select_flask_ep  ON batch_flask_endpoints FOR SELECT USING (true);
CREATE POLICY staff_insert_flask_ep  ON batch_flask_endpoints FOR INSERT WITH CHECK (true);
CREATE POLICY staff_update_flask_ep  ON batch_flask_endpoints FOR UPDATE USING (true);


-- ── 6. batch_flask_straining ─────────────────────────────────
-- Per-flask. Replaces batch_stage_straining (batch-level).
-- StrainingPanel.js upserts with onConflict: 'flask_id'.
-- No restrictive CHECK on method/clarity/temp — code values evolved
-- beyond v3 constraints, validation is handled on the frontend.
CREATE TABLE IF NOT EXISTS batch_flask_straining (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flask_id              UUID NOT NULL REFERENCES batch_flasks(id) ON DELETE CASCADE,
  batch_id              UUID NOT NULL REFERENCES batches(id)      ON DELETE CASCADE,
  method                TEXT,
  straining_temp        TEXT,
  filtrate_colour       TEXT,
  filtrate_clarity      TEXT,
  pre_straining_vol_ml  NUMERIC,
  post_straining_vol_ml NUMERIC,
  recovery_pct          NUMERIC(5,2),
  filtrate_ph           NUMERIC(4,2),
  notes                 TEXT,
  operator_id           UUID REFERENCES employees(id),
  supervised_by         UUID REFERENCES employees(id),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (flask_id)
);

ALTER TABLE batch_flask_straining ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_flask_strain     ON batch_flask_straining;
DROP POLICY IF EXISTS staff_select_flask_strain  ON batch_flask_straining;
DROP POLICY IF EXISTS staff_insert_flask_strain  ON batch_flask_straining;
DROP POLICY IF EXISTS staff_update_flask_strain  ON batch_flask_straining;
CREATE POLICY admin_all_flask_strain     ON batch_flask_straining FOR ALL    USING (is_admin());
CREATE POLICY staff_select_flask_strain  ON batch_flask_straining FOR SELECT USING (true);
CREATE POLICY staff_insert_flask_strain  ON batch_flask_straining FOR INSERT WITH CHECK (true);
CREATE POLICY staff_update_flask_strain  ON batch_flask_straining FOR UPDATE USING (true);


-- ── 7. batch_flask_extract_addition ──────────────────────────
-- Per-flask. Replaces batch_stage_extract_addition (batch-level).
-- ExtractAdditionPanel.js upserts with onConflict: 'flask_id'.
-- No restrictive CHECK on species/method/temp — code uses broader values.
CREATE TABLE IF NOT EXISTS batch_flask_extract_addition (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flask_id                UUID NOT NULL REFERENCES batch_flasks(id) ON DELETE CASCADE,
  batch_id                UUID NOT NULL REFERENCES batches(id)      ON DELETE CASCADE,
  mushroom_species        TEXT,
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
  addition_pct            NUMERIC(5,2),
  final_product_ph        NUMERIC(4,2),
  addition_temp           TEXT,
  addition_method         TEXT,
  colour_before           TEXT,
  colour_after            TEXT,
  laf_used                BOOLEAN DEFAULT true,
  notes                   TEXT,
  operator_id             UUID REFERENCES employees(id),
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE (flask_id)
);

ALTER TABLE batch_flask_extract_addition ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_flask_ext     ON batch_flask_extract_addition;
DROP POLICY IF EXISTS staff_select_flask_ext  ON batch_flask_extract_addition;
DROP POLICY IF EXISTS staff_insert_flask_ext  ON batch_flask_extract_addition;
DROP POLICY IF EXISTS staff_update_flask_ext  ON batch_flask_extract_addition;
CREATE POLICY admin_all_flask_ext     ON batch_flask_extract_addition FOR ALL    USING (is_admin());
CREATE POLICY staff_select_flask_ext  ON batch_flask_extract_addition FOR SELECT USING (true);
CREATE POLICY staff_insert_flask_ext  ON batch_flask_extract_addition FOR INSERT WITH CHECK (true);
CREATE POLICY staff_update_flask_ext  ON batch_flask_extract_addition FOR UPDATE USING (true);


-- ── 8. batch_flask_qc_samples ────────────────────────────────
-- Per-flask. Replaces batch_qc_samples (batch-level, wrong FK).
-- QCHoldPanel.js inserts with flask_id + sample_id (auto-generated).
-- NOTE: column is 'volume_ml' — code writes volume_ml, not vol_per_flask_ml.
CREATE TABLE IF NOT EXISTS batch_flask_qc_samples (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flask_id          UUID NOT NULL REFERENCES batch_flasks(id) ON DELETE CASCADE,
  batch_id          UUID          REFERENCES batches(id)      ON DELETE CASCADE,
  sample_id         TEXT NOT NULL,        -- QCS-YYYY-MM-XXXX auto-generated in QCHoldPanel
  sampling_date     DATE DEFAULT CURRENT_DATE,
  sampling_operator UUID REFERENCES employees(id),
  volume_ml         NUMERIC,
  testing_location  TEXT CHECK (testing_location IN ('In-house', 'NABL external lab')),
  external_lab      TEXT,
  ext_ref_number    TEXT,
  sample_sent_date  DATE,
  expected_date     DATE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (flask_id)                        -- one sample record per flask
);

ALTER TABLE batch_flask_qc_samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_flask_qcs     ON batch_flask_qc_samples;
DROP POLICY IF EXISTS staff_select_flask_qcs  ON batch_flask_qc_samples;
DROP POLICY IF EXISTS staff_insert_flask_qcs  ON batch_flask_qc_samples;
DROP POLICY IF EXISTS staff_update_flask_qcs  ON batch_flask_qc_samples;
CREATE POLICY admin_all_flask_qcs     ON batch_flask_qc_samples FOR ALL    USING (is_admin());
CREATE POLICY staff_select_flask_qcs  ON batch_flask_qc_samples FOR SELECT USING (true);
CREATE POLICY staff_insert_flask_qcs  ON batch_flask_qc_samples FOR INSERT WITH CHECK (true);
CREATE POLICY staff_update_flask_qcs  ON batch_flask_qc_samples FOR UPDATE USING (true);


-- ── 9. batch_flask_qc_tests ──────────────────────────────────
-- Per-test result rows, FK to batch_flask_qc_samples.
-- QCHoldPanel.js bulk-inserts 8 rows on sample creation,
-- then updates individual rows (result_value, tested_at, pass_fail).
CREATE TABLE IF NOT EXISTS batch_flask_qc_tests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id    UUID NOT NULL REFERENCES batch_flask_qc_samples(id) ON DELETE CASCADE,
  flask_id     UUID          REFERENCES batch_flasks(id) ON DELETE CASCADE,
  test_name    TEXT NOT NULL,
  target_spec  TEXT,
  result_value TEXT,
  result_unit  TEXT,
  pass_fail    TEXT CHECK (pass_fail IN ('Pass', 'Fail', 'Pending', 'N/A')) DEFAULT 'Pending',
  tested_at    DATE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE batch_flask_qc_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_flask_qct     ON batch_flask_qc_tests;
DROP POLICY IF EXISTS staff_select_flask_qct  ON batch_flask_qc_tests;
DROP POLICY IF EXISTS staff_insert_flask_qct  ON batch_flask_qc_tests;
DROP POLICY IF EXISTS staff_update_flask_qct  ON batch_flask_qc_tests;
CREATE POLICY admin_all_flask_qct     ON batch_flask_qc_tests FOR ALL    USING (is_admin());
CREATE POLICY staff_select_flask_qct  ON batch_flask_qc_tests FOR SELECT USING (true);
CREATE POLICY staff_insert_flask_qct  ON batch_flask_qc_tests FOR INSERT WITH CHECK (true);
CREATE POLICY staff_update_flask_qct  ON batch_flask_qc_tests FOR UPDATE USING (true);


-- ── 10. batch_flask_release_record ───────────────────────────
-- Per-flask terminal. Replaces batch_release_record (batch-level).
-- ReleasePanel.js upserts with onConflict: 'flask_id'.
-- release_date is auto-set by DEFAULT — ReleasePanel reads record.release_date.
-- bmr_url populated by BMR export route.
CREATE TABLE IF NOT EXISTS batch_flask_release_record (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flask_id         UUID NOT NULL REFERENCES batch_flasks(id) ON DELETE CASCADE,
  batch_id         UUID NOT NULL REFERENCES batches(id)      ON DELETE CASCADE,
  released_by      UUID REFERENCES employees(id),
  release_date     TIMESTAMPTZ DEFAULT now(),
  yield_volume_ml  NUMERIC,
  bottles_produced INTEGER,
  bottle_volume_ml NUMERIC,
  release_notes    TEXT,
  bmr_url          TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (flask_id)
);

ALTER TABLE batch_flask_release_record ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_flask_release     ON batch_flask_release_record;
DROP POLICY IF EXISTS staff_select_flask_release  ON batch_flask_release_record;
DROP POLICY IF EXISTS ceo_insert_flask_release    ON batch_flask_release_record;
DROP POLICY IF EXISTS ceo_update_flask_release    ON batch_flask_release_record;
CREATE POLICY admin_all_flask_release     ON batch_flask_release_record FOR ALL    USING (is_admin());
CREATE POLICY staff_select_flask_release  ON batch_flask_release_record FOR SELECT USING (true);
CREATE POLICY ceo_insert_flask_release    ON batch_flask_release_record FOR INSERT WITH CHECK (true);
CREATE POLICY ceo_update_flask_release    ON batch_flask_release_record FOR UPDATE USING (true);


-- ── 11. batch_flask_rejection_record ─────────────────────────
-- Per-flask terminal. Replaces batch_rejection_record (batch-level).
-- RejectionPanel.js upserts with onConflict: 'flask_id'.
-- rejection_date auto-set by DEFAULT — RejectionPanel reads record.rejection_date.
CREATE TABLE IF NOT EXISTS batch_flask_rejection_record (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flask_id         UUID NOT NULL REFERENCES batch_flasks(id) ON DELETE CASCADE,
  batch_id         UUID NOT NULL REFERENCES batches(id)      ON DELETE CASCADE,
  rejected_by      UUID REFERENCES employees(id),
  rejection_date   TIMESTAMPTZ DEFAULT now(),
  root_cause       TEXT NOT NULL,
  rejection_stage  TEXT,
  disposal_method  TEXT CHECK (disposal_method IN (
    'Autoclave + Drain', 'Incineration', 'Return for reprocessing', 'Other'
  )),
  capa_required    BOOLEAN DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (flask_id)
);

ALTER TABLE batch_flask_rejection_record ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_flask_reject     ON batch_flask_rejection_record;
DROP POLICY IF EXISTS staff_select_flask_reject  ON batch_flask_rejection_record;
DROP POLICY IF EXISTS ceo_insert_flask_reject    ON batch_flask_rejection_record;
DROP POLICY IF EXISTS ceo_update_flask_reject    ON batch_flask_rejection_record;
CREATE POLICY admin_all_flask_reject     ON batch_flask_rejection_record FOR ALL    USING (is_admin());
CREATE POLICY staff_select_flask_reject  ON batch_flask_rejection_record FOR SELECT USING (true);
CREATE POLICY ceo_insert_flask_reject    ON batch_flask_rejection_record FOR INSERT WITH CHECK (true);
CREATE POLICY ceo_update_flask_reject    ON batch_flask_rejection_record FOR UPDATE USING (true);


-- ── PERFORMANCE INDEXES ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_flask_inocu_flask   ON batch_flask_inoculations  (flask_id);
CREATE INDEX IF NOT EXISTS idx_flask_inocu_batch   ON batch_flask_inoculations  (batch_id);
CREATE INDEX IF NOT EXISTS idx_flask_ep_flask       ON batch_flask_endpoints     (flask_id);
CREATE INDEX IF NOT EXISTS idx_flask_strain_flask   ON batch_flask_straining     (flask_id);
CREATE INDEX IF NOT EXISTS idx_flask_ext_flask      ON batch_flask_extract_addition (flask_id);
CREATE INDEX IF NOT EXISTS idx_flask_qcs_flask      ON batch_flask_qc_samples    (flask_id);
CREATE INDEX IF NOT EXISTS idx_flask_qct_sample     ON batch_flask_qc_tests      (sample_id);
CREATE INDEX IF NOT EXISTS idx_flask_release_flask  ON batch_flask_release_record (flask_id);
CREATE INDEX IF NOT EXISTS idx_flask_reject_flask   ON batch_flask_rejection_record (flask_id);
CREATE INDEX IF NOT EXISTS idx_ferm_readings_batch  ON batch_fermentation_readings  (batch_id, flask_id);

-- ── DONE ──────────────────────────────────────────────────────
SELECT 'Batch Monitoring v4 (Flask-Level) migration complete — 8 per-flask tables + 2 column fixes applied.' AS status;
