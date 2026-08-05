const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Test with ANON key (what the browser client uses)
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Test with SERVICE ROLE key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('--- Testing with ANON key (browser client) ---');
  const { data: anonData, error: anonErr } = await supabaseAnon
    .from('cell_bank_vials')
    .select('id, vial_code, status')
    .eq('status', 'Available')
    .limit(5);
  console.log('Anon result count:', anonData?.length ?? 'null');
  console.log('Anon error:', anonErr?.message ?? 'none');

  console.log('\n--- Testing with SERVICE ROLE key (admin) ---');
  const { data: adminData, error: adminErr } = await supabaseAdmin
    .from('cell_bank_vials')
    .select('id, vial_code, status')
    .eq('status', 'Available')
    .limit(5);
  console.log('Admin result count:', adminData?.length ?? 'null');
  console.log('Admin error:', adminErr?.message ?? 'none');
}
main();
