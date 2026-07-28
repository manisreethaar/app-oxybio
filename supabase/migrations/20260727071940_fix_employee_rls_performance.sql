-- Fix performance issue caused by subquery in RLS policy for employees table
-- The previous policy wrapped auth.role() in a (select), which forced postgres to evaluate it per row during joins.
-- This caused severe timeouts for batches, equipment, and lab_notebook fetching, resulting in empty responses.

DROP POLICY IF EXISTS "employees_auth_select" ON public.employees;

CREATE POLICY "employees_auth_select" ON public.employees
  FOR SELECT USING (auth.role() = 'authenticated');

SELECT 'Fixed RLS performance for employees table' AS status;
