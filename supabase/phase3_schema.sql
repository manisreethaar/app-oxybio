-- Phase 3 HR & Payroll Schema

-- 1. Shifts and Rotational Scheduling
CREATE TABLE IF NOT EXISTS hr_shifts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_night_shift BOOLEAN DEFAULT FALSE,
  grace_period_mins INTEGER DEFAULT 15,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES hr_shifts(id);
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC DEFAULT 0;

-- 2. Timesheet Lock-in
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS manager_signoff_by UUID REFERENCES employees(id);
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS manager_signoff_at TIMESTAMP WITH TIME ZONE;

-- 3. Biometrics Validation
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS liveness_score NUMERIC;
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS face_match_score NUMERIC;

-- 4. Public Holiday Calendar
CREATE TABLE IF NOT EXISTS hr_holidays (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  is_mandatory BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5 & 6 & 7. Advanced Leave (LOP, Comp-off, Encashment)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS comp_off_balance NUMERIC DEFAULT 0;
ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS lop_days NUMERIC DEFAULT 0;

CREATE TABLE IF NOT EXISTS leave_encashments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  leave_type TEXT NOT NULL,
  days_encashed NUMERIC NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'Pending', -- Pending, Approved, Paid
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Out-of-Office Delegation
CREATE TABLE IF NOT EXISTS hr_delegations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  delegator_id UUID REFERENCES employees(id),
  delegatee_id UUID REFERENCES employees(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9 & 10. Tax Profiles, PF/ESI, TDS
CREATE TABLE IF NOT EXISTS hr_tax_profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) UNIQUE,
  pan_number TEXT,
  uan_number TEXT,
  esi_number TEXT,
  pf_applicable BOOLEAN DEFAULT TRUE,
  esi_applicable BOOLEAN DEFAULT FALSE,
  pt_applicable BOOLEAN DEFAULT TRUE,
  tds_percentage NUMERIC DEFAULT 0,
  standard_deduction NUMERIC DEFAULT 50000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Expense Reimbursements
CREATE TABLE IF NOT EXISTS hr_expenses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  title TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  receipt_url TEXT,
  status TEXT DEFAULT 'Pending', -- Pending, Approved, Rejected, Paid
  payslip_id UUID, -- Will link to payslips when processed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bulk Payroll & Bank Exports will rely on updating the payslips table
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS pf_deduction NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS esi_deduction NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS pt_deduction NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS tds_deduction NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS reimbursements NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS net_payable NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS is_exported BOOLEAN DEFAULT FALSE;

-- RLS
ALTER TABLE hr_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_encashments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_expenses ENABLE ROW LEVEL SECURITY;
