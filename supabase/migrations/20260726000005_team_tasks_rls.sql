-- Drop existing policies
DROP POLICY IF EXISTS staff_select_tasks ON tasks;
DROP POLICY IF EXISTS staff_update_tasks ON tasks;

-- Recreate policies to allow assigned_to IS NULL
CREATE POLICY staff_select_tasks ON tasks FOR SELECT USING (assigned_to = auth_employee_id() OR assigned_to IS NULL);
CREATE POLICY staff_update_tasks ON tasks FOR UPDATE USING (assigned_to = auth_employee_id() OR assigned_to IS NULL);
