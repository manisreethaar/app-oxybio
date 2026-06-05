-- Fix: All remaining module DB gaps after full cross-module audit
--
-- PROBLEMS FOUND:
-- 1. growth_measurements missing 4 columns added to UI (A-42 VFA, A-43 temp)
-- 2. 5 tables had RLS enabled but ZERO policies = all reads/writes blocked:
--    customer_complaints, internal_audits, predictive_models,
--    scale_down_models, stability_timepoints

-- ============================================================
-- Fix 1: Missing columns on growth_measurements
-- ============================================================
ALTER TABLE growth_measurements
  ADD COLUMN IF NOT EXISTS acetate_mmol_l     numeric,  -- A-42 VFA profile
  ADD COLUMN IF NOT EXISTS propionate_mmol_l  numeric,  -- A-42 VFA profile
  ADD COLUMN IF NOT EXISTS butyrate_mmol_l    numeric,  -- A-42 VFA profile
  ADD COLUMN IF NOT EXISTS test_temperature_c numeric;  -- A-43 temperature optima

-- ============================================================
-- Fix 2: RLS policies for zero-policy tables
-- ============================================================

-- customer_complaints (Compliance Hub tab — was fully blocked)
DROP POLICY IF EXISTS "auth_all_complaints" ON customer_complaints;
CREATE POLICY "auth_all_complaints" ON customer_complaints
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- internal_audits (Compliance Hub tab — was fully blocked)
DROP POLICY IF EXISTS "auth_all_audits" ON internal_audits;
CREATE POLICY "auth_all_audits" ON internal_audits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- predictive_models (Bioprocess Predictive Models tab — was fully blocked)
DROP POLICY IF EXISTS "auth_all_pred_models" ON predictive_models;
CREATE POLICY "auth_all_pred_models" ON predictive_models
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- scale_down_models (Bioprocess Scale-Down tab — was fully blocked)
DROP POLICY IF EXISTS "auth_all_scale_down" ON scale_down_models;
CREATE POLICY "auth_all_scale_down" ON scale_down_models
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- stability_timepoints (Shelf Life A-23 reconciliation — was fully blocked)
DROP POLICY IF EXISTS "auth_all_stability_tp" ON stability_timepoints;
CREATE POLICY "auth_all_stability_tp" ON stability_timepoints
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
