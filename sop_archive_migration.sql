ALTER TABLE sop_acknowledgements 
  ADD COLUMN IF NOT EXISTS pin_verified BOOLEAN DEFAULT false;

ALTER TABLE sop_library 
  ADD COLUMN IF NOT EXISTS effective_date DATE;
