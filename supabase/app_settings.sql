-- App Settings Table for operational thresholds and configuration
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_by UUID REFERENCES employees(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default thresholds
INSERT INTO app_settings (key, value, description) 
VALUES ('thresholds', '{"minPh": 4.0, "maxPh": 7.8, "tempMax": 35}', 'Operational pH and temperature thresholds')
ON CONFLICT (key) DO NOTHING;

-- Allow all authenticated users to read settings
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings" ON app_settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage settings" ON app_settings
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.email = auth.jwt()->>'email' 
      AND employees.role IN ('admin', 'ceo', 'cto')
    )
  );
