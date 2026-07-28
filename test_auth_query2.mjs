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
  const email = 'temp_perf_test2@oxybio.com';
  const password = 'Password123!';
  
  console.log('Creating temp user...');
  const { data: userResp } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  const uid = userResp?.user?.id;
  if (!uid) return console.log('Failed to create user');

  console.log('Inserting into employees...');
  await supabaseAdmin.from('employees').insert({
    id: uid,
    email,
    full_name: 'Test Admin',
    role: 'admin',
    is_active: true
  });
  
  console.log('Signing in...');
  await supabaseUser.auth.signInWithPassword({ email, password });
  
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
  await supabaseAdmin.from('employees').delete().eq('id', uid);
  await supabaseAdmin.auth.admin.deleteUser(uid);
}

run();
