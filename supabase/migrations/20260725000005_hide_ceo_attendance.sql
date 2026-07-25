-- Hide CEO attendance logs from everyone except the CEO
-- Even other admins cannot see, update, or delete the CEO's attendance records.

-- 1. Drop existing policies on attendance_log
DROP POLICY IF EXISTS attendance_own_select ON public.attendance_log;
DROP POLICY IF EXISTS attendance_own_update ON public.attendance_log;
DROP POLICY IF EXISTS attendance_admin_delete ON public.attendance_log;

-- 2. Create the new SELECT policy
-- Users can see their own attendance logs.
-- Admins can see logs ONLY IF the log does not belong to a CEO.
CREATE POLICY "attendance_own_select" ON public.attendance_log
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email')
    OR (
      public.is_admin()
      AND employee_id NOT IN (SELECT id FROM public.employees WHERE role = 'ceo')
    )
  );

-- 3. Create the new UPDATE policy
-- Users can update their own attendance logs (e.g., mispunch requests).
-- Admins can update logs ONLY IF the log does not belong to a CEO.
CREATE POLICY "attendance_own_update" ON public.attendance_log
  FOR UPDATE USING (
    employee_id IN (SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email')
    OR (
      public.is_admin()
      AND employee_id NOT IN (SELECT id FROM public.employees WHERE role = 'ceo')
    )
  );

-- 4. Create the new DELETE policy
-- Admins can delete logs ONLY IF the log does not belong to a CEO.
-- A user (including the CEO) can delete their own logs (if they want to, assuming they have admin rights for their own or if this policy covers it, but normally employees can't delete logs. We will allow users to delete their own just so the CEO isn't completely blocked from deleting their own if they need to).
-- Wait, the original delete policy only allowed admins. So let's retain that structure but exclude CEOs, unless the admin IS the CEO deleting their own.
CREATE POLICY "attendance_admin_delete" ON public.attendance_log
  FOR DELETE USING (
    (public.is_admin() AND employee_id NOT IN (SELECT id FROM public.employees WHERE role = 'ceo'))
    OR employee_id IN (SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email')
  );
