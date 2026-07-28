import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const supabaseUser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const email = 'temp_perf_test@oxybio.com';
  const password = 'Password123!';
  
  console.log('Creating temp user...');
  const { data: user, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  
  if (createErr && createErr.message !== 'User already registered') {
    console.error('Create error:', createErr);
    return;
  }
  
  console.log('Signing in...');
  const { error: signinErr } = await supabaseUser.auth.signInWithPassword({ email, password });
  if (signinErr) {
    console.error('Signin error:', signinErr);
    return;
  }
  
  console.log('Testing query...');
  const start = Date.now();
  const { data, error } = await supabaseUser
    .from('activity_log')
    .select('id')
    .limit(5);
    
  console.log(`Query finished in ${Date.now() - start}ms`);
  if (error) console.error('Query error:', error);
  else console.log('Rows:', data.length);
  
  console.log('Cleaning up...');
  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const uid = users.users.find(u => u.email === email)?.id;
  if (uid) await supabaseAdmin.auth.admin.deleteUser(uid);
}

run();
