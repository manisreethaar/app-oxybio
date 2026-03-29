-- phase3_payroll.sql
-- Add base salary for LOP auto-calculations
ALTER TABLE employees ADD COLUMN IF NOT EXISTS base_salary NUMERIC DEFAULT 0;

-- Expand Payslips for auto-generation capability
ALTER TABLE payslips ALTER COLUMN payslip_url DROP NOT NULL;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS lop_days NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS working_days NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT false;
