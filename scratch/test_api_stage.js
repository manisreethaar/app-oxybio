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
  console.log(`Testing transition for Batch: ${batchId}`);

  // Fetch from the Next.js API running locally... Wait, the API is not running locally for the script.
  // I will just mock the gate logic.
  
  const { data } = await supabase
    .from('batch_stage_media_prep')
    .select('is_complete, ragi_moisture_pass')
    .eq('batch_id', batchId)
    .single();
    
  console.log('Gate data:', data);
  if (!data?.is_complete) console.log('Error: Media Prep is not marked complete.');
  if (data?.ragi_moisture_pass === false) console.log('Error: Ragi moisture check FAILED.');
}
check();
