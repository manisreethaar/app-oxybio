const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkColumns() {
  const { data, error } = await supabase.rpc('query_trigger_func', { func_name: 'does_not_exist' });
  // Since I don't have an arbitrary SQL RPC, let's just do a select limit 1 and see the keys
  const { data: row, error: err } = await supabase.from('batch_flask_extract_addition').select('*').limit(1);
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Columns in batch_flask_extract_addition:');
    if (row && row.length > 0) {
      console.log(Object.keys(row[0]));
    } else {
      console.log('Table is empty. Cannot determine columns via REST select *');
      
      // Try an insert that will fail to see the error message?
      const { error: insErr } = await supabase.from('batch_flask_extract_addition').insert({ id: '00000000-0000-0000-0000-000000000000' });
      console.log('Insert error might have details:', insErr);
    }
  }
}

checkColumns();
