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
  console.log(`Testing transition API for Batch: ${batchId}`);

  // Insert media prep
  await supabase.from('batch_stage_media_prep').upsert({
    batch_id: batchId,
    ragi_moisture_pass: true,
    is_complete: true,
  }, { onConflict: 'batch_id' });

  // Update batch directly like the API does
  const newStatus = 'in-progress';
  const transitionToStage = 'sterilisation';
  const { error: updateErr } = await supabase
      .from('batches')
      .update({ current_stage: transitionToStage, status: newStatus })
      .eq('id', batchId);
      
  console.log('Batch Update Error:', updateErr);
}
check();
