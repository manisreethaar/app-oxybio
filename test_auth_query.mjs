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
  const email = 'temp_perf_test_staff@oxybio.com';
  const password = 'Password123!';
  
  console.log('Creating temp user...');
  const { data: user, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  
  const uid = user?.user?.id;
  if (!uid) {
    console.error('Failed to create user', createErr);
    return;
  }

  // Insert into employees with role: 'staff'
  await supabaseAdmin.from('employees').upsert({
    id: uid,
    full_name: 'Perf Test Staff',
    email,
    role: 'staff',
    is_active: true
  });
  
  console.log('Signing in...');
  await supabaseUser.auth.signInWithPassword({ email, password });
  
  console.log('Testing queries as staff...');
  const batchId = '27288930-063e-4db2-874e-2d6db7ba25d0';
  
  const queries = [
    { name: 'batches', promise: supabaseUser.from('batches').select('*, formulations(id, name, code, version, ingredients, base_volume_ml)').eq('id', batchId).single() },
    { name: 'batch_flasks', promise: supabaseUser.from('batch_flasks').select('*').eq('batch_id', batchId).order('flask_label') },
    { name: 'stage_transitions', promise: supabaseUser.from('stage_transitions').select('*, employees!stage_transitions_changed_by_fkey(full_name)').eq('batch_id', batchId).order('created_at', { ascending: false }) },
    { name: 'employees', promise: supabaseUser.from('employees').select('id, full_name, role').eq('is_active', true).order('full_name') },
    { name: 'inventory_stock', promise: supabaseUser.from('inventory_stock').select('*, inventory_items(name, unit, category)').gt('current_quantity', 0).eq('status', 'Available') },
    { name: 'lab_notebook_entries', promise: supabaseUser.from('lab_notebook_entries').select('id, flask_id').eq('batch_id', batchId) },
    { name: 'batch_flask_endpoints', promise: supabaseUser.from('batch_flask_endpoints').select('total_hours, flask_id').eq('batch_id', batchId) }
  ];

  for (const q of queries) {
    const start = Date.now();
    const res = await q.promise;
    const duration = Date.now() - start;
    console.log(`Query '${q.name}' took ${duration}ms. Error: ${res.error ? res.error.message : 'None'}`);
  }
  
  console.log('Cleaning up...');
  await supabaseAdmin.from('employees').delete().eq('id', uid);
  await supabaseAdmin.auth.admin.deleteUser(uid);
}

run();
