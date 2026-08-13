const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkBatch002() {
  const { data: batch, error: bErr } = await supabase
    .from('batches')
    .select('id, batch_id, current_stage, status')
    .ilike('batch_id', '%002%');
    
  if (bErr || !batch || batch.length === 0) {
    console.log('Batch 002 not found or error:', bErr);
    return;
  }
  
  console.log('Batch Details:', batch);
  
  for (const b of batch) {
    const { data: flasks, error: fErr } = await supabase
      .from('batch_flasks')
      .select('id, flask_label, current_stage, status')
      .eq('batch_id', b.id);
      
    console.log(`Flasks for ${b.batch_id}:`, flasks);
  }
}
checkBatch002();
