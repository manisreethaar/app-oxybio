-- Run this in Supabase SQL Editor to add new employee profile fields
-- Safe to run multiple times (uses IF NOT EXISTS equivalents)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_code TEXT,
  ADD COLUMN IF NOT EXISTS designation TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS blood_group TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Remove the old restrictive department constraint if it still exists
ALTER TABLE employees 
  DROP CONSTRAINT IF EXISTS employees_department_check;
