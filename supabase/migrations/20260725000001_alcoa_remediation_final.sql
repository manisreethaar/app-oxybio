-- ALCOA++ and GDP Remediation Migration
-- Adding missing 'Attributable' columns and fixing 'Contemporaneous' timestamp types

-- 1. Batch QC Tests
ALTER TABLE batch_flask_qc_tests 
  ADD COLUMN IF NOT EXISTS tested_by uuid REFERENCES employees(id),
  ALTER COLUMN tested_at TYPE timestamptz USING tested_at::timestamptz;

-- 2. Customer Complaints
ALTER TABLE customer_complaints
  ADD COLUMN IF NOT EXISTS logged_by uuid REFERENCES employees(id);

-- 3. SOP Management
ALTER TABLE sop_library
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES employees(id);

ALTER TABLE sop_quizzes
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES employees(id);

-- 4. Sampling Plans
ALTER TABLE aql_sampling_plans
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES employees(id);

-- 5. Inventory and Master Data
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES employees(id);

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES employees(id);

ALTER TABLE inventory_stock
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES employees(id);

-- 6. Equipment
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS registered_by uuid REFERENCES employees(id);

-- 7. HR Configuration
ALTER TABLE hr_shifts
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES employees(id);

ALTER TABLE hr_holidays
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES employees(id);

ALTER TABLE hr_delegations
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES employees(id);


