CREATE TABLE IF NOT EXISTS document_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO document_categories (name) VALUES 
('Fermentation'), ('QC'), ('Sanitation'), ('Safety')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE document_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all authenticated users" 
ON document_categories FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Enable all access for admin users" 
ON document_categories FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM employees 
    WHERE email = auth.jwt()->>'email' 
    AND role IN ('admin', 'ceo', 'cto')
  )
);
