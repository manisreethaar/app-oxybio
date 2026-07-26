-- Fix to allow new roles (e.g. scientist, cto, ceo) and departments (e.g. R&D, Admin)
-- by dropping the hardcoded check constraints on the employees table.

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_department_check;
