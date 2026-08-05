const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const batchId = '27288930-063e-4db2-874e-2d6db7ba25d0';
console.log('Testing speed...');

const start = Date.now();
Promise.all([
  supabase.from('batches').select('*, formulations(id, name, code, version, ingredients, base_volume_ml)').eq('id', batchId).single(),
  supabase.from('batch_flasks').select('*').eq('batch_id', batchId).order('flask_label'),
  supabase.from('stage_transitions').select('*, employees!stage_transitions_changed_by_fkey(full_name)').eq('batch_id', batchId).order('created_at', { ascending: false }),
  supabase.from('employees').select('id, full_name, role').eq('is_active', true).order('full_name'),
  supabase.from('inventory_stock').select('*, inventory_items(name, unit, category)').gt('current_quantity', 0).eq('status', 'Available'),
  supabase.from('lab_notebook_entries').select('id, flask_id').eq('batch_id', batchId),
  supabase.from('batch_flask_endpoints').select('total_hours, flask_id').eq('batch_id', batchId),
]).then(res => {
  console.log('Time:', Date.now() - start, 'ms');
}).catch(err => console.error(err));
