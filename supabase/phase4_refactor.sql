-- Migration: Phase 1 App-Wide Refactoring (Hardcoded Data Extraction)

-- 1. Create system_config table for app-wide settings (Geofencing, HR Policies)
CREATE TABLE IF NOT EXISTS system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for system_config
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all authenticated users" ON system_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable all access for admin users" ON system_config FOR ALL TO authenticated USING (
    (SELECT role FROM public.employees WHERE id = auth.uid()) IN ('admin', 'ceo', 'cto')
);

-- Seed system_config
INSERT INTO system_config (key, value, description) VALUES
('attendance_geofence', '{"TARGET_LAT": 13.0827, "TARGET_LNG": 80.2707, "MAX_RADIUS_METERS": 100}', 'Attendance check-in geofence config'),
('hr_policies', '{"CL_ONLY_ROLES": ["intern", "research_intern", "research_fellow"]}', 'Roles that are only eligible for Casual Leave'),
('role_codes', '{"admin": "ADM", "scientist": "SCI", "technician": "TEC", "intern": "INT", "research_intern": "R-INT", "research_fellow": "R-FEL"}', 'Employee ID role prefixes')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. Create lookup_categories table for Compliance, SOPs, and Calendar
CREATE TABLE IF NOT EXISTS lookup_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL, -- e.g., 'compliance', 'sop', 'calendar'
    name VARCHAR(255) NOT NULL,
    color VARCHAR(50), -- Optional UI color string
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(type, name)
);

-- RLS for lookup_categories
ALTER TABLE lookup_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all authenticated users" ON lookup_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable all access for admin users" ON lookup_categories FOR ALL TO authenticated USING (
    (SELECT role FROM public.employees WHERE id = auth.uid()) IN ('admin', 'ceo', 'cto')
);

-- Seed lookup_categories
INSERT INTO lookup_categories (type, name, color) VALUES
('compliance', 'FSSAI', 'orange'),
('compliance', 'TIIC', 'blue'),
('compliance', 'PF', 'green'),
('compliance', 'ESI', 'violet'),
('compliance', 'ISO', 'purple'),
('calendar', 'Grant (SISFS/DPIIT)', 'indigo'),
('calendar', 'Regulatory (FSSAI/GST)', 'orange'),
('calendar', 'Internal Milestone', 'gray'),
('calendar', 'Maintenance', 'red'),
('sop', 'Manufacturing', 'blue'),
('sop', 'Quality Control', 'purple'),
('sop', 'Safety & Hygiene', 'red'),
('sop', 'Equipment Operation', 'violet')
ON CONFLICT (type, name) DO NOTHING;

-- 3. Alter sop_library table to add quiz_data
ALTER TABLE sop_library ADD COLUMN IF NOT EXISTS quiz_data JSONB DEFAULT '[]'::jsonb;

-- Seed fallback quiz for existing SOPs to prevent breaking the UI
UPDATE sop_library
SET quiz_data = '[{"q": "What is the primary objective of this SOP?", "options": ["General reading", "Strict compliance", "Optional reference"], "correct": 1}, {"q": "Who is responsible for executing this procedure?", "options": ["Any staff", "Trained personnel only", "External contractors"], "correct": 1}]'::jsonb
WHERE quiz_data = '[]'::jsonb OR quiz_data IS NULL;
