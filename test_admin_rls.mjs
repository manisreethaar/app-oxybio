import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We need an admin's token. Let's use the service role to simulate auth.role() = 'authenticated',
// or just create an admin client if we can get a JWT.
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  // Let's sign in as an admin or regular user to test RLS.
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@oxybio.com', // guess or fetch from employees
    password: 'password123'
  });
  console.log('Login admin@oxybio.com:', error?.message || 'Success');
  
  if (data.session) {
    const { data: logs, error: fetchErr } = await supabase.from('titration_logs').select('*');
    console.log('Admin logs fetched:', logs?.length, fetchErr);
  }
}
run();
