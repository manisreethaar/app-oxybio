-- ENABLE DELETE FOR ADMIN ROLES
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'inventory_items') THEN
        CREATE POLICY "Allow delete items" ON inventory_items FOR DELETE USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('admin', 'ceo', 'cto')));
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'equipment') THEN
        CREATE POLICY "Allow delete equipment" ON equipment FOR DELETE USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('admin', 'ceo', 'cto')));
    END IF;
END $$;
