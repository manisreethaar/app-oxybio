-- Fix RLS for batch_flask_extract_addition
ALTER TABLE public.batch_flask_extract_addition ENABLE ROW LEVEL SECURITY;

-- Drop all old policies
DROP POLICY IF EXISTS "bfext_auth_all" ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS "bfext_admin_all" ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS "bfext_staff_insert" ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS "bfext_staff_update" ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS admin_all_flask_ext ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS staff_select_flask_ext ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS staff_insert_flask_ext ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS staff_update_flask_ext ON public.batch_flask_extract_addition;

-- Create a clean, modern authenticated policy
CREATE POLICY "bfext_auth_all_fixed" ON public.batch_flask_extract_addition
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Reload schema
NOTIFY pgrst, 'reload schema';
