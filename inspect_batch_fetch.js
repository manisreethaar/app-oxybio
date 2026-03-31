require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const { data, error } = await supabase
        .from('batches')
        .select('*, lab_logs(*, employees(full_name))')
        .limit(1);
        
  console.log("Error details:", JSON.stringify(error, null, 2));
}
test();
