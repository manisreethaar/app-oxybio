const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  // Find a batch that is in media_prep
  const { data: batches } = await supabase.from('batches').select('id, current_stage').eq('current_stage', 'media_prep').limit(1);
  if (!batches || batches.length === 0) {
    console.log('No batches in media_prep found.');
    return;
  }
  const batchId = batches[0].id;
  
  // Find a flask for this batch
  const { data: flasks } = await supabase.from('batch_flasks').select('id, flask_label').eq('batch_id', batchId).limit(1);
  if (!flasks || flasks.length === 0) {
    console.log('No flasks found for batch', batchId);
    return;
  }
  const flaskId = flasks[0].id;
  console.log(`Testing transition for Batch: ${batchId}, Flask: ${flaskId}`);

  // Try calling the RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc('advance_flask_stage', {
    p_flask_id: flaskId,
    p_batch_id: batchId,
    p_to_stage: 'sterilisation',
    p_employee_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
    p_flask_label: flasks[0].flask_label
  });

  console.log('RPC Error:', rpcError);
  console.log('RPC Data:', rpcData);
}

check();
