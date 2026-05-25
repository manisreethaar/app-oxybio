const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.*?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*?)"/)[1];

const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase.from('employees').update({ 
    dummy_column: 'test' 
  }).eq('id', 'non-existent').select();
  console.log('Data:', data);
  console.log('Error:', error);
}

test();
