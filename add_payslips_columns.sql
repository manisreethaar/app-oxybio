-- Run this in your Supabase SQL Editor to add the missing columns to the payslips table
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS base_salary NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_working_days NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS present_days NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_leave_days NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_hours_worked NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lop_deduction NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_lop_days NUMERIC,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;
