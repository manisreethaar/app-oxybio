-- Migration: Add sample_incubation_records table
-- Description: Table for tracking R&D and QC sample incubations (plates, broths, cell banks, etc)

CREATE TABLE IF NOT EXISTS sample_incubation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    sample_name TEXT NOT NULL,
    sample_category TEXT CHECK (sample_category IN ('Fermentation IPC', 'Cell Bank', 'Passage', 'Subculture', 'Other')),
    sample_type TEXT CHECK (sample_type IN ('Agar Plate', 'Broth')),
    incubation_date DATE DEFAULT CURRENT_DATE,
    incubation_temp_c NUMERIC(5,2),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration_hours NUMERIC,
    od_value NUMERIC(6,3),
    ph_value NUMERIC(4,2),
    staining_method TEXT,
    microscopic_morphology TEXT,
    colony_morphology TEXT,
    sterility_status TEXT CHECK (sterility_status IN ('Pending', 'Sterile', 'Contaminated')),
    observation TEXT,
    logged_by UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger to automatically calculate duration_hours
CREATE OR REPLACE FUNCTION calc_incubation_duration() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
        NEW.duration_hours := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calc_incubation_duration ON sample_incubation_records;
CREATE TRIGGER trg_calc_incubation_duration
BEFORE INSERT OR UPDATE ON sample_incubation_records
FOR EACH ROW EXECUTE FUNCTION calc_incubation_duration();

-- RLS Policies
ALTER TABLE sample_incubation_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_sample_incubation ON sample_incubation_records;
CREATE POLICY admin_all_sample_incubation ON sample_incubation_records FOR ALL USING (is_admin());

DROP POLICY IF EXISTS staff_select_sample_incubation ON sample_incubation_records;
CREATE POLICY staff_select_sample_incubation ON sample_incubation_records FOR SELECT USING (true);

DROP POLICY IF EXISTS staff_insert_sample_incubation ON sample_incubation_records;
CREATE POLICY staff_insert_sample_incubation ON sample_incubation_records FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS staff_update_sample_incubation ON sample_incubation_records;
CREATE POLICY staff_update_sample_incubation ON sample_incubation_records FOR UPDATE USING (true);
