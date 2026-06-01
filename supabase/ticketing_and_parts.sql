-- 1. Create equipment_tickets table
CREATE TABLE IF NOT EXISTS equipment_tickets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'Open',
  reported_by UUID REFERENCES employees(id),
  resolved_by UUID REFERENCES employees(id),
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE equipment_tickets ENABLE ROW LEVEL SECURITY;

-- 2. Modify inventory_usage for spare parts linkage
ALTER TABLE inventory_usage ALTER COLUMN batch_id DROP NOT NULL;
ALTER TABLE inventory_usage ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE;
ALTER TABLE inventory_usage ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES equipment_tickets(id) ON DELETE CASCADE;
