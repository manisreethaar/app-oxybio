-- OXYOS PHASE 2 RLS REMEDIATION
-- Run this in the Supabase SQL Editor to restore write access for Staff and Admins.

-- 1. Inventory Items (Metadata)
CREATE POLICY "Allow admin manage items" ON inventory_items FOR ALL USING (is_admin());
CREATE POLICY "Allow staff read items" ON inventory_items FOR SELECT USING (true);

-- 2. Inventory Stock (Stocking)
CREATE POLICY "Allow authenticated insert stock" ON inventory_stock FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Allow authenticated update stock" ON inventory_stock FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Allow admin delete stock" ON inventory_stock FOR DELETE USING (is_admin());

-- 3. Vendors (AVL)
CREATE POLICY "Allow admin manage vendors" ON vendors FOR ALL USING (is_admin());
CREATE POLICY "Allow staff read vendors" ON vendors FOR SELECT USING (true);

-- 4. Equipment
CREATE POLICY "Allow admin manage equipment" ON equipment FOR ALL USING (is_admin());
CREATE POLICY "Allow staff update equipment status" ON equipment FOR UPDATE USING (true);
CREATE POLICY "Allow staff read equipment" ON equipment FOR SELECT USING (true);

-- 5. Calibration Logs
CREATE POLICY "Allow auth insert calibration" ON calibration_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Allow auth read calibration" ON calibration_logs FOR SELECT USING (true);

-- 6. Lab Logs
CREATE POLICY "Allow auth insert lab logs" ON lab_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Allow auth read lab logs" ON lab_logs FOR SELECT USING (true);
