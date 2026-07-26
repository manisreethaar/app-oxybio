const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  const query = `
    CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM employees 
        WHERE employees.id = auth.uid() AND role IN ('admin', 'ceo', 'cto')
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;
  const { data, error } = await supabase.rpc('execute_sql', { query });
  console.log('Result:', data, error);
}
fix();
