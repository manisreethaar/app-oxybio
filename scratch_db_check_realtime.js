const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRealtime() {
  const { data, error } = await supabase.rpc('get_realtime_tables'); // Or just raw SQL via postgres
  console.log(data, error);
}

// Since I can't do raw SQL easily with the JS client without an RPC, I will just output the hypothesis.
// But wait, there is a query to pg_publication_tables.
async function rawQuery() {
    const { data, error } = await supabase.from('pg_publication_tables').select('*').eq('pubname', 'supabase_realtime');
    console.log('Realtime tables:', data, error);
}

rawQuery();
