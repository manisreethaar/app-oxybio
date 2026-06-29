-- Migration: Payroll Management Enhancements
-- Run this in Supabase SQL Editor

-- 1. Add extra columns to payslips table for richer tracking
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS total_hours_worked  NUMERIC,
  ADD COLUMN IF NOT EXISTS admin_notes          TEXT,
  ADD COLUMN IF NOT EXISTS override_lop_days   NUMERIC,
  ADD COLUMN IF NOT EXISTS period_start        DATE,
  ADD COLUMN IF NOT EXISTS period_end          DATE,
  ADD COLUMN IF NOT EXISTS base_salary         NUMERIC,
  ADD COLUMN IF NOT EXISTS lop_days            NUMERIC,
  ADD COLUMN IF NOT EXISTS lop_deduction       NUMERIC,
  ADD COLUMN IF NOT EXISTS total_working_days  INTEGER,
  ADD COLUMN IF NOT EXISTS present_days        INTEGER,
  ADD COLUMN IF NOT EXISTS approved_leave_days NUMERIC,
  ADD COLUMN IF NOT EXISTS is_auto_generated   BOOLEAN DEFAULT FALSE;
