const {createClient} = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  console.time('fetch');
  const { data, error } = await supabase.from('batches').select('*').limit(1);
  console.timeEnd('fetch');
  console.log(data ? data.length : error.message);
}
test();
