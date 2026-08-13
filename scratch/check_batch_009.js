const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkBatch009() {
  const { data, error } = await supabase
    .from('batches')
    .select('status, current_stage')
    .eq('batch_id', 'OB-FER-26-009')
    .single();

  console.log('Batch 009:', data);
  
  const { data: flasks } = await supabase
    .from('batch_flasks')
    .select('flask_label, status, current_stage')
    .eq('batch_id', (await supabase.from('batches').select('id').eq('batch_id', 'OB-FER-26-009').single()).data.id);
    
  console.log('Flasks:', flasks);
}

checkBatch009();
