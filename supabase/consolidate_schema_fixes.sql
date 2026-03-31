-- FINAL CONSOLIDATED SCHEMA FIXES (March 31, 2026)
-- Run this in your Supabase SQL Editor to ensure all backend features are active.

-- 1. Ensure Task Management columns are complete
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS progress_logs JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS is_acknowledged BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS logged_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS time_started_at TIMESTAMP WITH TIME ZONE;

-- 2. Ensure Attendance Log columns for Mispunch and Automation work
ALTER TABLE attendance_log 
ADD COLUMN IF NOT EXISTS mispunch_status TEXT DEFAULT NULL, 
ADD COLUMN IF NOT EXISTS mispunch_requested_hours NUMERIC DEFAULT 0, 
ADD COLUMN IF NOT EXISTS mispunch_reason TEXT DEFAULT NULL, 
ADD COLUMN IF NOT EXISTS mispunch_remark TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- 3. Ensure Push Notification support in Employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS push_subscription JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS casual_leave_balance INTEGER DEFAULT 12,
ADD COLUMN IF NOT EXISTS medical_leave_balance INTEGER DEFAULT 6,
ADD COLUMN IF NOT EXISTS earned_leave_balance INTEGER DEFAULT 15;

-- 4. Re-calculate missing total_hours for legacy manual entries (Optional)
-- UPDATE attendance_log SET total_hours = 0 WHERE mispunch_status = 'required' AND total_hours IS NULL;
