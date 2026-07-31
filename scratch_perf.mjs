import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testPerformance() {
  const batchId = '27288930-063e-4db2-874e-2d6db7ba25d0';
  console.log('Testing query performance...');
  
  const queries = [
    { name: 'batches', promise: supabase.from('batches').select('*, formulations(id, name, code, version, ingredients, base_volume_ml)').eq('id', batchId).single() },
    { name: 'batch_flasks', promise: supabase.from('batch_flasks').select('*').eq('batch_id', batchId).order('flask_label') },
    { name: 'stage_transitions', promise: supabase.from('stage_transitions').select('*, employees!stage_transitions_changed_by_fkey(full_name)').eq('batch_id', batchId).order('created_at', { ascending: false }) },
    { name: 'employees', promise: supabase.from('employees').select('id, full_name, role').eq('is_active', true).order('full_name') },
    { name: 'inventory_stock', promise: supabase.from('inventory_stock').select('*, inventory_items(name, unit, category)').gt('current_quantity', 0).eq('status', 'Available') },
    { name: 'lab_notebook_entries', promise: supabase.from('lab_notebook_entries').select('id, flask_id').eq('batch_id', batchId) },
    { name: 'batch_flask_endpoints', promise: supabase.from('batch_flask_endpoints').select('total_hours, flask_id').eq('batch_id', batchId) }
  ];

  for (const q of queries) {
    const start = Date.now();
    const res = await q.promise;
    const duration = Date.now() - start;
    console.log(`Query '${q.name}' took ${duration}ms. Rows: ${res.data ? (Array.isArray(res.data) ? res.data.length : 1) : 0}, Error: ${res.error ? res.error.message : 'None'}`);
  }
}

testPerformance();
