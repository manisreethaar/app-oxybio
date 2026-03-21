-- OxyOS Database Schema Update
-- Instructions: Copy all the text below and paste it into the Supabase SQL Editor, then click Run.

-- 1. Remove strict dropdown constraints from employees table
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_department_check;
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;

-- This allows you to type "R&D", "Intern", "Admin", or any custom department you invent in the future!
