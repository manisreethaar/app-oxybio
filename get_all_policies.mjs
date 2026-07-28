import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const sql = `
    SELECT schemaname, tablename, policyname, qual, with_check 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND (qual LIKE '%employees%' OR with_check LIKE '%employees%');
  `;
  const { data, error } = await supabase.rpc('query', { sql_query: sql });
  if (error) {
    console.error('Error running query RPC:', error.message);
  } else {
    console.log('Policies using employees table in qual/with_check:');
    console.log(JSON.stringify(data, null, 2));
  }
}
run();
