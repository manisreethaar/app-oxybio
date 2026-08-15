const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkBatch009Full() {
  const { data: batch } = await supabase.from('batches').select('*').eq('batch_id', 'OB-FER-26-009').single();
  console.log(batch);
}

checkBatch009Full();
