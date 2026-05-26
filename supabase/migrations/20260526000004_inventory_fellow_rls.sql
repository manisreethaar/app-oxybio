-- 20260526000004_inventory_fellow_rls.sql
-- Grants research_fellow and scientist roles the ability to insert and update inventory items and vendors.

CREATE POLICY "inv_items_fellow_insert" ON public.inventory_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE email = auth.jwt()->>'email'
        AND role IN ('research_fellow', 'scientist', 'Research Fellow', 'Scientist')
        AND is_active = true
    )
  );

CREATE POLICY "inv_items_fellow_update" ON public.inventory_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE email = auth.jwt()->>'email'
        AND role IN ('research_fellow', 'scientist', 'Research Fellow', 'Scientist')
        AND is_active = true
    )
  );

CREATE POLICY "vendors_fellow_insert" ON public.vendors
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE email = auth.jwt()->>'email'
        AND role IN ('research_fellow', 'scientist', 'Research Fellow', 'Scientist')
        AND is_active = true
    )
  );

CREATE POLICY "vendors_fellow_update" ON public.vendors
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE email = auth.jwt()->>'email'
        AND role IN ('research_fellow', 'scientist', 'Research Fellow', 'Scientist')
        AND is_active = true
    )
  );
