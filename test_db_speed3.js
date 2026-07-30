const {createClient} = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testSpeed() {
  console.log('Testing DB Speed bypassing RLS...');
  
  console.time('batches');
  await supabase.from('batches').select('*').limit(10);
  console.timeEnd('batches');

  console.time('inventory_items');
  await supabase.from('inventory_items').select('*, creator:employees!inventory_items_created_by_fkey(id, full_name, initials)').limit(10);
  console.timeEnd('inventory_items');

  console.time('equipment');
  await supabase.from('equipment').select('*, calibration_logs(*, employees:logged_by(full_name, initials))').limit(10);
  console.timeEnd('equipment');
  
  console.log('Done.');
}
testSpeed();
