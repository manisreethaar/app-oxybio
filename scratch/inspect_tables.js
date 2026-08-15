const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect(table) {
  const { data, error } = await supabase.from(table).select('*').limit(1);
  if (error) {
    console.error(`Error fetching ${table}:`, error);
  } else if (data && data.length > 0) {
    console.log(`\nTable ${table} keys:`, Object.keys(data[0]));
  } else {
    console.log(`\nTable ${table} is empty.`);
  }
}

async function run() {
  await inspect('batch_flask_endpoints');
  await inspect('batch_flask_straining');
  await inspect('batch_flask_extract_addition');
}
run();
