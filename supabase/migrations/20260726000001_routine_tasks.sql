-- Add routine task support and ALCOA++ compliance columns
ALTER TABLE tasks 
  ADD COLUMN IF NOT EXISTS is_routine BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS routine_interval TEXT, -- 'daily', 'weekly', 'monthly'
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS esignature_used BOOLEAN DEFAULT false;
