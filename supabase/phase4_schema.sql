-- Phase 4 Quality Control, Analytics, & Documentation Schema

-- 33. Customer Complaints
CREATE TABLE IF NOT EXISTS customer_complaints (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  product_batch UUID, -- Can't easily reference batches if they are in another schema context, but assume batches(id) exists
  complaint_details TEXT NOT NULL,
  capa_id UUID, 
  status TEXT DEFAULT 'Open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 34. Internal Audit Planning
CREATE TABLE IF NOT EXISTS internal_audits (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  audit_title TEXT NOT NULL,
  auditor_id UUID REFERENCES employees(id),
  audit_date DATE,
  status TEXT DEFAULT 'Planned',
  findings TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 35. Deviation Grading
ALTER TABLE deviations ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT 'Minor'; 

-- SOPs Base Table (Needed for foreign keys)
CREATE TABLE IF NOT EXISTS sops (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  file_url TEXT NOT NULL,
  version TEXT DEFAULT '1.0',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 36. Dynamic Quizzes
CREATE TABLE IF NOT EXISTS sop_quizzes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sop_id UUID REFERENCES sops(id) ON DELETE CASCADE,
  questions JSONB, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sop_quiz_results (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  quiz_id UUID REFERENCES sop_quizzes(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id),
  score NUMERIC NOT NULL,
  passed BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 37. Periodic Review
ALTER TABLE sops ADD COLUMN IF NOT EXISTS next_review_date DATE;

-- 39. Draft/Review Workflows
ALTER TABLE sops ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'Published'; 

-- 40. Departmental Targeting
CREATE TABLE IF NOT EXISTS sop_targets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sop_id UUID REFERENCES sops(id) ON DELETE CASCADE, 
  target_role TEXT NOT NULL, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 42. Arrhenius Degradation
ALTER TABLE shelf_life_studies ADD COLUMN IF NOT EXISTS projected_expiry_date DATE;

-- 43. Media Uploads for Stability
CREATE TABLE IF NOT EXISTS stability_timepoints (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  study_id UUID REFERENCES shelf_life_studies(id) ON DELETE CASCADE,
  timepoint_days INTEGER NOT NULL,
  test_results JSONB,
  evidence_photo_url TEXT,
  is_oos BOOLEAN DEFAULT FALSE, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Base Tasks table (Needed for recurrence/grouping)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'Open',
  due_date DATE,
  assigned_to UUID REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 52. Task Recurrence
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_rule TEXT; 
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID; 

-- 53. Group Tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS group_role_target TEXT; 
