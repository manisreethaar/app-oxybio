-- Phase 5 Dashboard & Activity Overhauls Schema

-- 65. Shift Handover Widget
CREATE TABLE IF NOT EXISTS shift_handovers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  outgoing_shift_id UUID REFERENCES employees(id),
  incoming_shift_id UUID REFERENCES employees(id),
  handover_notes TEXT NOT NULL,
  critical_alerts TEXT,
  signed_off_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 63. Custom Dashboards
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES employees(id) UNIQUE,
  dashboard_layout JSONB, -- Stores widget positioning and toggles
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 64. Real-time SCADA Feeds & 75. Data Acquisition
CREATE TABLE IF NOT EXISTS scada_streams (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id),
  batch_id UUID REFERENCES batches(id),
  sensor_type TEXT NOT NULL, -- e.g., 'pH', 'DO', 'Temperature', 'Agitation'
  sensor_value NUMERIC NOT NULL,
  unit TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 67. Costing Overlays & 82. Costing Integration
CREATE TABLE IF NOT EXISTS batch_costs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  batch_id UUID REFERENCES batches(id) UNIQUE,
  material_costs NUMERIC DEFAULT 0,
  labor_costs NUMERIC DEFAULT 0,
  overhead_costs NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
