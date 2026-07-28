import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Admin client to create or get a user
const adminSupabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: emps } = await adminSupabase.from('employees').select('id, email, full_name, role').limit(3);
  console.log('Test Employees:', emps);
  
  if (!emps || emps.length === 0) return;
  const emp = emps[0];
  
  console.log('\n--- Test fetch via Anon / RLS ---');
  // Usually we don't have the user's password, so let's just dump the policies from pg_policies if we can using a different approach.
  
  // Actually, we can check pg_policies using postgres if we connect directly, but we can't easily connect directly via pg here.
  // Wait, we can use `query_triggers.mjs` or similar scratch script to run SQL.
  const { data, error } = await adminSupabase.rpc('run_sql', { query: "SELECT * FROM pg_policies WHERE tablename = 'documents';" });
  console.log('Policies via run_sql rpc:', data, error);
}
test();
