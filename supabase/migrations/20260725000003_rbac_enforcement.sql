-- Phase 3: RBAC Enforcement Verification
-- Restrict standard users from modifying post-execution historical data.
-- Only 'ceo', 'cto', 'admin' (via public.is_admin()) have override privileges.

-- 1. batch_flask_qc_tests
-- Current policies to drop
DROP POLICY IF EXISTS "bfqct_auth_all" ON public.batch_flask_qc_tests;
DROP POLICY IF EXISTS "bfqct_admin_all" ON public.batch_flask_qc_tests;
DROP POLICY IF EXISTS "bfqct_staff_insert" ON public.batch_flask_qc_tests;
DROP POLICY IF EXISTS "bfqct_staff_update" ON public.batch_flask_qc_tests;

CREATE POLICY "bfqct_read_all" ON public.batch_flask_qc_tests FOR SELECT USING (true);
CREATE POLICY "bfqct_insert_all" ON public.batch_flask_qc_tests FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow update only if pass_fail is NULL/Pending, or user is admin
CREATE POLICY "bfqct_update_lock" ON public.batch_flask_qc_tests 
  FOR UPDATE USING (
    (pass_fail IS NULL OR pass_fail = 'Pending' OR pass_fail = '') OR public.is_admin()
  ) WITH CHECK (
    (pass_fail IS NULL OR pass_fail = 'Pending' OR pass_fail = '') OR public.is_admin()
  );

CREATE POLICY "bfqct_delete_admin" ON public.batch_flask_qc_tests FOR DELETE USING (public.is_admin());

-- 2. deviations
DROP POLICY IF EXISTS "dev_auth_all" ON public.deviations;

CREATE POLICY "dev_read_all" ON public.deviations FOR SELECT USING (true);
CREATE POLICY "dev_insert_all" ON public.deviations FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- Allow update only if status is Open, or user is admin
CREATE POLICY "dev_update_lock" ON public.deviations
  FOR UPDATE USING (
    status = 'Open' OR public.is_admin()
  ) WITH CHECK (
    status = 'Open' OR public.is_admin()
  );
CREATE POLICY "dev_delete_admin" ON public.deviations FOR DELETE USING (public.is_admin());

-- 3. capa_actions
DROP POLICY IF EXISTS "capa_auth_all" ON public.capa_actions;

CREATE POLICY "capa_read_all" ON public.capa_actions FOR SELECT USING (true);
CREATE POLICY "capa_insert_all" ON public.capa_actions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- Allow update only if status is Open, or user is admin
CREATE POLICY "capa_update_lock" ON public.capa_actions
  FOR UPDATE USING (
    status = 'Open' OR public.is_admin()
  ) WITH CHECK (
    status = 'Open' OR public.is_admin()
  );
CREATE POLICY "capa_delete_admin" ON public.capa_actions FOR DELETE USING (public.is_admin());

-- 4. system_audit_logs
-- Ensure completely immutable (no UPDATE/DELETE policies means denied by default, even for admins)
DROP POLICY IF EXISTS "admin_all_audit_logs" ON public.system_audit_logs;
DROP POLICY IF EXISTS "staff_read_audit_logs" ON public.system_audit_logs;

CREATE POLICY "audit_read_all" ON public.system_audit_logs FOR SELECT USING (true);
CREATE POLICY "audit_insert_all" ON public.system_audit_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
