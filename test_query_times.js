const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const batchId = '27288930-063e-4db2-874e-2d6db7ba25d0';

async function timeQuery(label, fn) {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  console.log(`${label}: ${ms}ms | rows=${result.data?.length ?? 'null'} | err=${result.error?.message ?? 'none'}`);
  return result;
}

async function main() {
  console.log('Testing each query individually with ANON key...\n');

  await timeQuery('batches (single)', () =>
    supabaseAnon.from('batches').select('*, formulations(id, name, code, version, ingredients, base_volume_ml)').eq('id', batchId).single()
  );
  await timeQuery('batch_flasks', () =>
    supabaseAnon.from('batch_flasks').select('*').eq('batch_id', batchId).order('flask_label')
  );
  await timeQuery('stage_transitions', () =>
    supabaseAnon.from('stage_transitions').select('*, employees!stage_transitions_changed_by_fkey(full_name)').eq('batch_id', batchId).order('created_at', { ascending: false })
  );
  await timeQuery('employees', () =>
    supabaseAnon.from('employees').select('id, full_name, role').eq('is_active', true).order('full_name')
  );
  await timeQuery('inventory_stock (ALL available)', () =>
    supabaseAnon.from('inventory_stock').select('*, inventory_items(name, unit, category)').gt('current_quantity', 0).eq('status', 'Available')
  );
  await timeQuery('lab_notebook_entries', () =>
    supabaseAnon.from('lab_notebook_entries').select('id, flask_id').eq('batch_id', batchId)
  );
  await timeQuery('batch_flask_endpoints', () =>
    supabaseAnon.from('batch_flask_endpoints').select('total_hours, flask_id').eq('batch_id', batchId)
  );
}

main();
