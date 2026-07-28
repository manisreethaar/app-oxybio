import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We must use the service_role key to bypass RLS and query pg_policies?
// Wait, pg_policies is a system catalog, PostgREST doesn't expose it by default.
// Let's test the actual queries as an authenticated user to see the exact time.

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const email = 'test_admin@oxybio.com';
  const password = 'Password123!';
  
  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  await supabase.auth.signInWithPassword({ email, password });

  const start = Date.now();
  console.log('Testing activity_log query...');
  const { data: act, error: e1 } = await supabase.from('activity_log').select('id').limit(50);
  console.log(`activity_log: ${Date.now() - start}ms`, e1 ? e1.message : `Success (${act.length} rows)`);

  const s2 = Date.now();
  console.log('Testing batches query...');
  const { data: bat, error: e2 } = await supabase.from('batches').select('batch_id').limit(50);
  console.log(`batches: ${Date.now() - s2}ms`, e2 ? e2.message : `Success (${bat?.length} rows)`);

  const s3 = Date.now();
  console.log('Testing employees query...');
  const { data: emp, error: e3 } = await supabase.from('employees').select('id').limit(50);
  console.log(`employees: ${Date.now() - s3}ms`, e3 ? e3.message : `Success (${emp?.length} rows)`);
  
  console.log(`Total time: ${Date.now() - start}ms`);
}
run();
