const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: batches } = await supabase.from('batches').select('id, current_stage').eq('current_stage', 'media_prep').limit(1);
  if (!batches || batches.length === 0) {
    console.log('No batches in media_prep found.');
    return;
  }
  const batchId = batches[0].id;
  console.log(`Testing UPSERT into batch_stage_media_prep for Batch: ${batchId}`);

  const payload = {
    batch_id: batchId,
    ragi_moisture_pass: true,
    is_complete: true,
  };

  const { data, error } = await supabase.from('batch_stage_media_prep').upsert(payload, { onConflict: 'batch_id' });
  console.log('Upsert Error:', error);
  console.log('Upsert Data:', data);
  
  // Clean up if it succeeded
  if (!error) {
    await supabase.from('batch_stage_media_prep').delete().eq('batch_id', batchId);
  }
}
check();
