import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) {
    console.error('No DB URL found');
    return;
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
DROP POLICY IF EXISTS "Anyone can view shared documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can manage documents" ON public.documents;

CREATE POLICY "Anyone can view shared documents" 
    ON public.documents FOR SELECT 
    USING (
        access_level = 'all-staff' 
        OR uploaded_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM employees 
            WHERE id = auth.uid() 
            AND (
                role = 'admin' 
                OR (role IN ('ceo', 'cto') AND access_level IN ('management-only', 'all-staff'))
            )
        )
    );

CREATE POLICY "Admins can manage documents" 
    ON public.documents FOR ALL 
    USING (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role = 'admin'));
    `);
    console.log('Success:', res);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
run();
