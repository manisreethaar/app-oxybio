const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testQueries() {
  const { data: { session }, error: authError } = await supabase.auth.signInWithPassword({
    email: 'founder@oxybio.in',
    password: 'admin123'
  });
  if (authError) {
    console.error('Auth error:', authError.message);
    return;
  }
  
  const batchId = '27288930-063e-4db2-874e-2d6db7ba25d0';
  console.log("Testing queries as authenticated user...");
  
  const results = await Promise.all([
    supabase.from('batches').select('*, formulations(id, name, code, version, ingredients, base_volume_ml)').limit(1),
    supabase.from('batch_flasks').select('*').limit(1),
    supabase.from('stage_transitions').select('*, employees!stage_transitions_changed_by_fkey(full_name)').limit(1),
    supabase.from('employees').select('id, full_name, role').limit(1),
    supabase.from('inventory_stock').select('*, inventory_items(name, unit, category)').limit(1),
    supabase.from('lab_notebook_entries').select('id, flask_id').limit(1),
    supabase.from('batch_flask_endpoints').select('total_hours, flask_id').limit(1),
  ]);
  
  results.forEach((res, index) => {
    if (res.error) {
      console.log(`Query ${index} Failed:`, res.error);
    } else {
      console.log(`Query ${index} OK.`);
    }
  });
}
testQueries();
