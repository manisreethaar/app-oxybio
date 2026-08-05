const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Test the vials API using service role
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('Fetching available vials...');
  const { data, error } = await supabase
    .from('cell_bank_vials')
    .select('id, vial_code, status')
    .eq('status', 'Available')
    .limit(10);
  
  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Available vials count:', data.length);
    console.log('Sample:', data.slice(0, 3));
  }
  
  // Also check ALL vials regardless of status
  const { data: all, error: e2 } = await supabase
    .from('cell_bank_vials')
    .select('id, vial_code, status')
    .limit(10);
    
  if (e2) {
    console.error('All vials error:', e2.message);
  } else {
    console.log('\nAll vials (any status, first 10):', all);
  }
}
main();
