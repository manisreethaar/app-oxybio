-- Migration: Add Released Employee Codes Table
-- Purpose: Track employee codes that have been released (e.g., from designation changes)
-- These codes can be reused instead of generating new sequential numbers

CREATE TABLE IF NOT EXISTS released_employee_codes (
  id SERIAL PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,
  released_at TIMESTAMPTZ DEFAULT NOW(),
  released_by UUID REFERENCES employees(id),
  reason TEXT DEFAULT 'designation_change'
);

-- Index for fast lookup when generating new codes
CREATE INDEX IF NOT EXISTS idx_released_codes_code ON released_employee_codes(employee_code);
CREATE INDEX IF NOT EXISTS idx_released_codes_prefix ON released_employee_codes(employee_code);
