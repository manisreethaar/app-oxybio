const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: constraints, error } = await supabase.rpc('get_table_constraints', { table_name: 'batch_flask_qc_tests' });
  if (error) {
     const { data: q } = await supabase.from('batch_flask_qc_tests').select('*').limit(1);
     console.log('Error calling rpc:', error);
  } else {
     console.log('Constraints:', constraints);
  }
}

check();
