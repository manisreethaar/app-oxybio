-- Fix taste_panels RLS: ensure admins/ceo/cto can delete panels
-- The "Allow read taste_panels" policy from master_sync.sql may conflict
-- with the newer taste_auth_all policy. This cleans up and re-establishes.

-- Drop all existing taste_panels policies to start fresh
DROP POLICY IF EXISTS "Allow read taste_panels" ON public.taste_panels;
DROP POLICY IF EXISTS taste_panels_all ON public.taste_panels;
DROP POLICY IF EXISTS taste_auth_all ON public.taste_panels;

-- SELECT: all authenticated users can read
CREATE POLICY "taste_select_auth" ON public.taste_panels
  FOR SELECT USING (auth.role() = 'authenticated');

-- INSERT: any authenticated user can create a panel
CREATE POLICY "taste_insert_auth" ON public.taste_panels
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- UPDATE: any authenticated user can update scores (PATCH route enforces admin-only for existing scores)
CREATE POLICY "taste_update_auth" ON public.taste_panels
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- DELETE: only admins/ceo/cto can delete panels
CREATE POLICY "taste_delete_admin" ON public.taste_panels
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE email = auth.jwt()->>'email'
        AND role IN ('admin', 'ceo', 'cto')
        AND is_active = true
    )
  );

SELECT 'taste_panels RLS policies fixed successfully.' AS status;
