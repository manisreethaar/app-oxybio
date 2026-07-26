-- 1. Add targeting columns to sop_library
ALTER TABLE sop_library ADD COLUMN IF NOT EXISTS target_roles TEXT[] DEFAULT '{}';
ALTER TABLE sop_library ADD COLUMN IF NOT EXISTS target_departments TEXT[] DEFAULT '{}';
ALTER TABLE sop_library ADD COLUMN IF NOT EXISTS target_employees UUID[] DEFAULT '{}';

-- 2. Create helper functions for RLS
CREATE OR REPLACE FUNCTION auth_employee_role() RETURNS TEXT AS $$
  SELECT role FROM employees WHERE id = auth_employee_id() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_employee_department() RETURNS TEXT AS $$
  SELECT department FROM employees WHERE id = auth_employee_id() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- 3. Update the RLS Policy for Staff SELECT on sop_library
DROP POLICY IF EXISTS staff_select_sops ON sop_library;

CREATE POLICY staff_select_sops ON sop_library FOR SELECT USING (
  -- Leadership bypass
  auth_employee_role() IN ('admin', 'ceo', 'cto')
  OR
  (
    -- If all targeting arrays are empty, it's assigned to "All Staff"
    (array_length(target_roles, 1) IS NULL AND array_length(target_departments, 1) IS NULL AND array_length(target_employees, 1) IS NULL)
    OR 
    -- Or if there is a match with the current user's profile
    auth_employee_role() = ANY(target_roles)
    OR
    auth_employee_department() = ANY(target_departments)
    OR
    auth_employee_id() = ANY(target_employees)
  )
);
