-- OxyOS Global Mutation Recovery Script
-- Targets: Employees (Profile Edits), Attendance (Check-ins), Document Vault (Uploads)

-- 1. EMPLOYEES: Enable Profile Patching
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Employees can update own profile" ON public.employees;
CREATE POLICY "Employees can update own profile" 
    ON public.employees FOR UPDATE 
    USING (auth.uid() = id) 
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Anyone can read employee profiles" ON public.employees;
CREATE POLICY "Anyone can read employee profiles" 
    ON public.employees FOR SELECT 
    USING (true);

-- 2. ATTENDANCE: Enable Logging
ALTER TABLE public.attendance_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Employees can insert own attendance" ON public.attendance_log;
CREATE POLICY "Employees can insert own attendance" 
    ON public.attendance_log FOR INSERT 
    WITH CHECK (auth.uid() = employee_id);

DROP POLICY IF EXISTS "Employees can view own attendance" ON public.attendance_log;
CREATE POLICY "Employees can view own attendance" 
    ON public.attendance_log FOR SELECT 
    USING (auth.uid() = employee_id OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'admin'));

-- 3. LABORATORY: Enable Production & Research
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view batches" ON public.batches;
CREATE POLICY "Anyone can view batches" ON public.batches FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff can create batches" ON public.batches;
CREATE POLICY "Staff can create batches" ON public.batches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Staff can update batches" ON public.batches;
CREATE POLICY "Staff can update batches" ON public.batches FOR UPDATE USING (auth.uid() IS NOT NULL);

ALTER TABLE public.formulations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view formulations" ON public.formulations;
CREATE POLICY "Anyone can view formulations" ON public.formulations FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff can create formulations" ON public.formulations;
CREATE POLICY "Staff can create formulations" ON public.formulations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.lab_notebook_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view notebooks" ON public.lab_notebook_entries;
CREATE POLICY "Anyone can view notebooks" ON public.lab_notebook_entries FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff can create notebook entries" ON public.lab_notebook_entries;
CREATE POLICY "Staff can create notebook entries" ON public.lab_notebook_entries FOR INSERT WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "Author can update own notebook" ON public.lab_notebook_entries;
CREATE POLICY "Author can update own notebook" ON public.lab_notebook_entries FOR UPDATE USING (auth.uid() = created_by);

-- 4. DOCUMENTS: Enable Vault Mutation (Admin Only)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view shared documents" ON public.documents;
CREATE POLICY "Anyone can view shared documents" 
    ON public.documents FOR SELECT 
    USING (access_level = 'all-staff' OR EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can manage documents" ON public.documents;
CREATE POLICY "Admins can manage documents" 
    ON public.documents FOR ALL 
    USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'admin'));

-- 4. UPLOAD AUDIT TRACE
-- Ensure there is a table for tracking upload meta if needed, but for now we rely on the folders.
