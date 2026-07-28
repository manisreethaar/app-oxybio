import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const email = 'temp_perf_test@oxybio.com';
  const password = 'Password123!';
  
  await supabaseUser.auth.signInWithPassword({ email, password });
  
  console.log('Testing EXACT 9 queries from ActivityClient...');
  const start = Date.now();
  
  const promises = [];
  promises.push(supabaseUser.from('batches').select('batch_id, product_name, status').is('archived_at', null).limit(20).then(()=>Date.now()-start));
  promises.push(supabaseUser.from('equipment').select('id, name, model, status').eq('status', 'Operational').then(()=>Date.now()-start));
  promises.push(supabaseUser.from('activity_log').select('id').limit(50).then(()=>Date.now()-start));
  promises.push(supabaseUser.from('activity_log').select('id').not('archived_at', 'is', null).limit(100).then(()=>Date.now()-start));
  promises.push(supabaseUser.from('activity_log').select('id').eq('issue_observed', true).is('archived_at', null).limit(200).then(()=>Date.now()-start));
  
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  promises.push(supabaseUser.from('employees').select('id, full_name, designation, role').eq('is_active', true).neq('role', 'admin').neq('role', 'ceo').neq('role', 'cto').then(()=>Date.now()-start));
  promises.push(supabaseUser.from('attendance_log').select('employee_id, check_out_time').eq('date', today).then(()=>Date.now()-start));
  promises.push(supabaseUser.from('tasks').select('id, title, priority, due_date, assigned_user:employees!tasks_assigned_to_fkey(full_name)').neq('status', 'done').neq('status', 'cancelled').lt('due_date', today).order('due_date', { ascending: true }).limit(5).then(()=>Date.now()-start));
  promises.push(supabaseUser.from('tasks').select('id, title, assigned_user:employees!tasks_assigned_to_fkey(full_name)').eq('approval_status', 'pending_review').limit(5).then(()=>Date.now()-start));

  try {
    const results = await Promise.all(promises);
    console.log(`All queries finished in ${Date.now() - start}ms. Result times:`, results);
  } catch(e) {
    console.error('Error:', e);
  }
}
run();
