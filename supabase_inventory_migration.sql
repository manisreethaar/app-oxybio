-- Supabase Migration: Inventory and Equipment Tables
-- Please run this directly in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name TEXT NOT NULL,
    category TEXT CHECK (category IN ('Raw Material', 'Packaging', 'Consumable', 'Reagent', 'Other')),
    quantity NUMERIC DEFAULT 0,
    unit TEXT NOT NULL,
    minimum_threshold NUMERIC DEFAULT 0,
    last_restocked DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    model TEXT,
    serial_number TEXT,
    status TEXT CHECK (status IN ('active', 'maintenance', 'broken', 'retired')),
    location TEXT,
    last_calibrated DATE,
    next_calibration DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_inventory ON inventory FOR ALL USING (is_admin());
CREATE POLICY staff_select_inventory ON inventory FOR SELECT USING (true);

CREATE POLICY admin_all_equipment ON equipment FOR ALL USING (is_admin());
CREATE POLICY staff_select_equipment ON equipment FOR SELECT USING (true);
