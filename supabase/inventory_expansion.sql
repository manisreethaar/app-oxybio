-- Stage 1: Database Expansion for Inventory & Supply Chain Overhaul

-- 1. Create Movements Ledger table
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_id UUID REFERENCES inventory_stock(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL, -- 'Receive', 'Issue', 'Adjust'
  quantity DECIMAL(12,2) NOT NULL,
  purpose VARCHAR(100), -- 'Production Use', 'QC Testing', 'R&D', 'Internal Use', 'Sample', 'Disposal'
  notes TEXT,
  issued_by UUID REFERENCES auth.users(id), -- Tracks logging user
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Expand inventory_items mapping
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS sub_category VARCHAR(50);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS storage_condition VARCHAR(100); -- e.g. Room Temp, Frozen
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS preferred_supplier UUID REFERENCES vendors(id);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS hazardous BOOLEAN DEFAULT false;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS cold_chain_required BOOLEAN DEFAULT false;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS coa_required BOOLEAN DEFAULT false;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS allergen BOOLEAN DEFAULT false;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS organic_certified VARCHAR(50);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_code VARCHAR(30) UNIQUE;

-- 3. Expand inventory_stock tracking
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS purchase_order_number VARCHAR(50);
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS invoice_ref VARCHAR(50);
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS condition_on_arrival VARCHAR(50); -- e.g. Good, Damaged
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS sds_url TEXT; 
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS coa_url TEXT;

-- 4. Set row level security (RLS) policies if enabled
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated reads on movements" ON inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated inserts on movements" ON inventory_movements FOR INSERT TO authenticated WITH CHECK (true);
