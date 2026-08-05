-- Fix Titration Logs RLS issues

-- 1. Fix the SELECT policy to ensure all authenticated users can view logs without caching/evaluation issues.
DROP POLICY IF EXISTS "titration_logs_select" ON public.titration_logs;
CREATE POLICY "titration_logs_select" ON public.titration_logs
  FOR SELECT USING (auth.role() = 'authenticated');

-- 2. Fix the DELETE and UPDATE policies to allow all authorized roles (admin, ceo, cto, qa, supervisor, lab_manager) 
--    to delete/update logs, matching the API route logic.
DROP POLICY IF EXISTS "titration_logs_delete" ON public.titration_logs;
CREATE POLICY "titration_logs_delete" ON public.titration_logs
  FOR DELETE USING (
    logged_by IN (SELECT id FROM public.employees WHERE email = auth.jwt()->>'email')
    OR EXISTS (
      SELECT 1 FROM public.employees 
      WHERE email = auth.jwt()->>'email' 
        AND role IN ('admin', 'ceo', 'cto', 'supervisor', 'lab_manager', 'qa')
        AND is_active = true
    )
  );

DROP POLICY IF EXISTS "titration_logs_update" ON public.titration_logs;
CREATE POLICY "titration_logs_update" ON public.titration_logs
  FOR UPDATE USING (
    logged_by IN (SELECT id FROM public.employees WHERE email = auth.jwt()->>'email')
    OR EXISTS (
      SELECT 1 FROM public.employees 
      WHERE email = auth.jwt()->>'email' 
        AND role IN ('admin', 'ceo', 'cto', 'supervisor', 'lab_manager', 'qa')
        AND is_active = true
    )
  );

NOTIFY pgrst, 'reload schema';
