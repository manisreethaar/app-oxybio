require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const { data, error } = await supabase.from('inventory_stock').insert({
    notes: 'test'
  }).select();
  console.log("Error:", error?.message);
}
test();
