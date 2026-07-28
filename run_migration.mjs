import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  const sql = fs.readFileSync('./supabase/migrations/20260727071940_fix_employee_rls_performance.sql', 'utf8');
  console.log('Running SQL:', sql);
  const { data, error } = await supabase.rpc('query', { sql_query: sql });
  console.log('Result:', data, error);
}
runMigration();
