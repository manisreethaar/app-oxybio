-- ==========================================
-- PHASE 2: O₂B Food-Tech Pipeline & CAPA Engine
-- ==========================================

-- 1. UNIVERSAL PRODUCTION REGISTRY (Food-Tech)
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'media_prep';

CREATE TABLE IF NOT EXISTS lab_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  process_type TEXT NOT NULL, -- e.g., 'formulation', 'thermal', 'natural_fermentation', 'qc'
  parameter_name TEXT NOT NULL, -- e.g., 'Brix', 'Yield', 'OD600', 'Viscosity', 'Temperature'
  parameter_value NUMERIC NOT NULL,
  logged_by UUID REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE lab_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON lab_logs FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON lab_logs FOR INSERT WITH CHECK (auth.uid() = logged_by);

-- 2. PERSONAL REMINDERS
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_personal_reminder BOOLEAN DEFAULT FALSE;

-- 3. CAPA ENGINE (Corrective & Preventive Action)
CREATE TABLE IF NOT EXISTS deviations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL, -- 'Low', 'Major', 'Critical'
  source TEXT NOT NULL, -- 'Internal Audit', 'Batch Deviation', 'Equipment Failure', 'Other'
  description TEXT NOT NULL,
  reported_by UUID REFERENCES employees(id),
  status TEXT DEFAULT 'Open', -- 'Open', 'Investigating', 'CAPA Assigned', 'Closed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investigations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  deviation_id UUID REFERENCES deviations(id) ON DELETE CASCADE,
  why_1 TEXT,
  why_2 TEXT,
  why_3 TEXT,
  why_4 TEXT,
  why_5 TEXT,
  root_cause_identified TEXT,
  investigator_id UUID REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS capa_actions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  investigation_id UUID REFERENCES investigations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'Corrective', 'Preventive'
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  effectiveness_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE deviations ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE capa_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable full access to deviations" ON deviations FOR ALL USING (true);
CREATE POLICY "Enable full access to investigations" ON investigations FOR ALL USING (true);
CREATE POLICY "Enable full access to capa_actions" ON capa_actions FOR ALL USING (true);
