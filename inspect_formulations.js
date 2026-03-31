require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const { data, error } = await supabase.from('formulations').select('*').limit(1);
  console.log("formulations:", data);
}
test();
