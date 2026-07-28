import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const email = 'temp_perf_test3@oxybio.com';
  const password = 'Password123!';
  
  await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true }).then(r => r.data?.user?.id).then(uid => {
    if (uid) supabaseAdmin.from('employees').insert({ id: uid, email, full_name: 'Test', role: 'admin', is_active: true });
  });
  
  await supabaseUser.auth.signInWithPassword({ email, password });
  
  console.log('Testing 20 concurrent queries...');
  const start = Date.now();
  const promises = [];
  
  // Simulate the dashboard / activity load
  for(let i=0; i<5; i++) promises.push(supabaseUser.from('activity_log').select('id').limit(10).then(()=>Date.now()-start));
  for(let i=0; i<5; i++) promises.push(supabaseUser.from('batches').select('batch_id').limit(10).then(()=>Date.now()-start));
  for(let i=0; i<5; i++) promises.push(supabaseUser.from('tasks').select('id').limit(10).then(()=>Date.now()-start));
  for(let i=0; i<5; i++) promises.push(supabaseUser.from('equipment').select('id').limit(10).then(()=>Date.now()-start));
  for(let i=0; i<5; i++) promises.push(supabaseUser.from('inventory_stock').select('id').limit(10).then(()=>Date.now()-start));
  
  try {
    const results = await Promise.all(promises);
    console.log(`All queries finished in ${Date.now() - start}ms. Result times:`, results);
  } catch(e) {
    console.error('Error:', e);
  }
  
  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const uid = users.users.find(u => u.email === email)?.id;
  if (uid) {
    await supabaseAdmin.from('employees').delete().eq('id', uid);
    await supabaseAdmin.auth.admin.deleteUser(uid);
  }
}
run();
