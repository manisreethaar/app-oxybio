-- 1. UNIVERSAL PRODUCTION REGISTRY (Food-Tech) - UPDATED with process_flow
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'media_prep';
ALTER TABLE batches ADD COLUMN IF NOT EXISTS process_flow JSONB; 

CREATE TABLE IF NOT EXISTS lab_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  process_type TEXT NOT NULL, 
  parameter_name TEXT NOT NULL, 
  parameter_value NUMERIC NOT NULL,
  logged_by UUID REFERENCES employees(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stage_transitions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_by UUID REFERENCES employees(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. PERSONAL REMINDERS
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_personal_reminder BOOLEAN DEFAULT FALSE;

-- 3. CAPA ENGINE (Corrective & Preventive Action)
CREATE TABLE IF NOT EXISTS deviations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  severity TEXT NOT NULL, 
  source TEXT NOT NULL, 
  description TEXT NOT NULL,
  reported_by UUID REFERENCES employees(id),
  status TEXT DEFAULT 'Open', 
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
  action_type TEXT NOT NULL, 
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  effectiveness_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. VENDORS & AVL
CREATE TABLE IF NOT EXISTS vendors (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT, 
  status TEXT DEFAULT 'Approved', 
  contact_info JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. INVENTORY & STOCK
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL, 
  unit TEXT NOT NULL,
  min_stock_level NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_stock (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id),
  supplier_batch_number TEXT,
  received_quantity NUMERIC NOT NULL,
  current_quantity NUMERIC NOT NULL,
  expiry_date DATE,
  location TEXT,
  status TEXT DEFAULT 'Available', 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_usage (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  stock_id UUID REFERENCES inventory_stock(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  quantity_used NUMERIC NOT NULL,
  logged_by UUID REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. EQUIPMENT & CALIBRATION
CREATE TABLE IF NOT EXISTS equipment (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT,
  serial_number TEXT UNIQUE,
  calibration_due_date DATE,
  status TEXT DEFAULT 'Operational', 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calibration_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  calibration_date DATE DEFAULT CURRENT_DATE,
  next_due_date DATE,
  result TEXT, 
  certificate_url TEXT,
  logged_by UUID REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS POLICIES FOR NEW TABLES
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read vendors" ON vendors FOR SELECT USING (true);
CREATE POLICY "Allow read items" ON inventory_items FOR SELECT USING (true);
CREATE POLICY "Allow read stock" ON inventory_stock FOR SELECT USING (true);
CREATE POLICY "Allow read usage" ON inventory_usage FOR SELECT USING (true);
CREATE POLICY "Allow read equipment" ON equipment FOR SELECT USING (true);
CREATE POLICY "Allow read calibration" ON calibration_logs FOR SELECT USING (true);

-- Admin/Staff inserts
CREATE POLICY "Allow insert log" ON lab_logs FOR INSERT WITH CHECK (auth.uid() = logged_by);
CREATE POLICY "Allow insert usage" ON inventory_usage FOR INSERT WITH CHECK (true); -- Check handled in code
CREATE POLICY "Allow insert calibration" ON calibration_logs FOR INSERT WITH CHECK (true);
