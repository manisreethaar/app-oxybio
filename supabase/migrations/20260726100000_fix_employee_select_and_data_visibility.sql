-- ============================================================
-- CRITICAL FIX: employees table SELECT policy is missing for
-- non-admin users. This breaks ALL modules that read data
-- by performing a join to employees (e.g., LNB author, 
-- equipment calibration, payslips, etc.) because the 
-- RLS on employees blocks the subquery lookup.
--
-- ROOT CAUSE ANALYSIS:
--   - The original schema had "emp_read_self" (users see only self)
--     + "admin_all_employees" (admins see all).
--   - Migration 20260407000003 only added an employees UPDATE policy.
--   - The SELECT policy was NEVER updated to allow all authenticated
--     users to read the employees directory — which many modules
--     need for author/operator lookups.
--   - This causes every page that does a JOIN to employees 
--     (LNB author, equipment logged_by, payslips employee_id, 
--     calibration_logs, activity_log, etc.) to return EMPTY 
--     results for non-admin users because the employee sub-rows 
--     get filtered out by RLS.
--
-- FIX: Allow all authenticated users to SELECT from employees
-- (read the directory). The per-row sensitive data (salary, etc.)
-- is on payslips table which has its own RLS. The employees table
-- only stores name, role, dept, email — appropriate to share.
-- ============================================================

-- 1. Fix the employees SELECT policy
-- The old "emp_read_self" only allowed each user to see THEIR OWN row.
-- This broke every join query that tried to resolve author/operator names.
DROP POLICY IF EXISTS emp_read_self ON public.employees;
DROP POLICY IF EXISTS "emp_read_self" ON public.employees;

-- Allow ALL authenticated users to read the employees directory
-- (needed for author lookups, countersigner names, operator IDs, etc.)
CREATE POLICY "employees_auth_select" ON public.employees
  FOR SELECT USING ((select auth.role()) = 'authenticated');

-- 2. Ensure employees UPDATE policy exists (it was added in migration-3 but verify)
-- DROP and RECREATE to be safe
DROP POLICY IF EXISTS "employees_update" ON public.employees;
CREATE POLICY "employees_update" ON public.employees
  FOR UPDATE USING (
    auth.uid() = id
    OR public.is_admin()
  );

-- 3. Keep admin full access for INSERT/DELETE
DROP POLICY IF EXISTS admin_all_employees ON public.employees;
DROP POLICY IF EXISTS "admin_all_employees" ON public.employees;
CREATE POLICY "employees_admin_insert" ON public.employees
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "employees_admin_delete" ON public.employees
  FOR DELETE USING (public.is_admin());

-- 4. Ensure leave_applications SELECT is also open to all authenticated
-- (so managers can see team leave requests)
DROP POLICY IF EXISTS staff_select_leave ON public.leave_applications;
DROP POLICY IF EXISTS "staff_select_leave" ON public.leave_applications;
DROP POLICY IF EXISTS admin_all_leaves ON public.leave_applications;
DROP POLICY IF EXISTS "admin_all_leaves" ON public.leave_applications;
-- Admin can do everything; staff can select their own; but managers need to see all
CREATE POLICY "leave_auth_select" ON public.leave_applications
  FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "leave_own_insert" ON public.leave_applications
  FOR INSERT WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email')
  );
CREATE POLICY "leave_admin_update" ON public.leave_applications
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "leave_admin_delete" ON public.leave_applications
  FOR DELETE USING (public.is_admin());

-- 5. Ensure tasks SELECT is NOT limited to only assigned tasks
-- The migration 20260726000003 fixed assigned_to IS NULL, but let's
-- also make sure admins see all tasks
DROP POLICY IF EXISTS staff_select_tasks ON public.tasks;
DROP POLICY IF EXISTS "staff_select_tasks" ON public.tasks;
DROP POLICY IF EXISTS admin_all_tasks ON public.tasks;
DROP POLICY IF EXISTS "admin_all_tasks" ON public.tasks;
DROP POLICY IF EXISTS "tasks_admin_all" ON public.tasks;
CREATE POLICY "tasks_auth_select" ON public.tasks
  FOR SELECT USING (
    assigned_to = (SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email')
    OR assigned_to IS NULL
    OR public.is_admin()
  );
DROP POLICY IF EXISTS staff_update_tasks ON public.tasks;
DROP POLICY IF EXISTS "staff_update_tasks" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    assigned_to = (SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email')
    OR assigned_to IS NULL
    OR public.is_admin()
  );
CREATE POLICY "tasks_auth_insert" ON public.tasks
  FOR INSERT WITH CHECK ((select auth.role()) = 'authenticated');
CREATE POLICY "tasks_admin_delete" ON public.tasks
  FOR DELETE USING (public.is_admin());

SELECT 'Employee SELECT RLS and related policy fixes applied.' AS status;
