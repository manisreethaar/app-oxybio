-- Fix: equipment_tickets has RLS enabled (supabase/phase2_schema.sql /
-- supabase/ticketing_and_parts.sql) but no policy was ever created for it.
-- Postgres RLS defaults to deny-all when a table has RLS enabled and zero
-- matching policies, so equipment maintenance tickets were invisible to
-- everyone (including admins). Bring it in line with the rest of the
-- Equipment module (equipment, calibration_logs use auth.role()='authenticated').

CREATE POLICY "equipment_tickets_auth_select" ON public.equipment_tickets
  FOR SELECT USING ((select auth.role()) = 'authenticated');

CREATE POLICY "equipment_tickets_auth_insert" ON public.equipment_tickets
  FOR INSERT WITH CHECK ((select auth.role()) = 'authenticated');

CREATE POLICY "equipment_tickets_auth_update" ON public.equipment_tickets
  FOR UPDATE USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

CREATE POLICY "equipment_tickets_admin_delete" ON public.equipment_tickets
  FOR DELETE USING (public.is_admin());
