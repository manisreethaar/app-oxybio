-- Fix: Missing columns identified by DB audit vs code comparison
-- + RLS policies for all new tables created during audit remediation

-- Fix 1-3: batch_stage_harvest missing columns (code saved these, DB didn't have them)
ALTER TABLE batch_stage_harvest
  ADD COLUMN IF NOT EXISTS viability_method  text,
  ADD COLUMN IF NOT EXISTS cooling_time_mins numeric,
  ADD COLUMN IF NOT EXISTS hold_temp_c       numeric;

-- Fix 4-6: batch_flask_extract_addition missing bioactive marker columns
-- (A-36, A-54 added to UI but migration was missed)
ALTER TABLE batch_flask_extract_addition
  ADD COLUMN IF NOT EXISTS polyphenol_mg_g numeric,
  ADD COLUMN IF NOT EXISTS beta_glucan_pct numeric,
  ADD COLUMN IF NOT EXISTS extract_biospec text;

-- Fix 7: viscosity column is stored as viscosity_cp (lowercase) in DB
-- Code fix: changed viscosity_cP -> viscosity_cp in MediaPrepPanel.js

-- RLS: enable + permissive authenticated policy for all new tables
ALTER TABLE emp_sampling_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE aql_sampling_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE scada_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_stage_harvest ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_stage_downstream ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_emp_locations" ON emp_sampling_locations;
DROP POLICY IF EXISTS "auth_all_emp_samples" ON emp_samples;
DROP POLICY IF EXISTS "auth_all_aql_plans" ON aql_sampling_plans;
DROP POLICY IF EXISTS "auth_all_scada" ON scada_streams;
DROP POLICY IF EXISTS "auth_all_handover" ON shift_handovers;
DROP POLICY IF EXISTS "auth_all_batch_costs" ON batch_costs;
DROP POLICY IF EXISTS "auth_all_harvest" ON batch_stage_harvest;
DROP POLICY IF EXISTS "auth_all_downstream" ON batch_stage_downstream;

CREATE POLICY "auth_all_emp_locations" ON emp_sampling_locations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_emp_samples" ON emp_samples
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_aql_plans" ON aql_sampling_plans
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_scada" ON scada_streams
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_handover" ON shift_handovers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_batch_costs" ON batch_costs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_harvest" ON batch_stage_harvest
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_downstream" ON batch_stage_downstream
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
