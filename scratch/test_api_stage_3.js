const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: batches } = await supabase.from('batches').select('id, current_stage').eq('current_stage', 'sterilisation').limit(1);
  
  if (!batches || batches.length === 0) {
    console.log('No batches in sterilisation found.');
    return;
  }
  
  const batchId = batches[0].id;
  console.log(`Testing transition from sterilisation to inoculation for Batch: ${batchId}`);
  
  // mock the sterilisation record so it passes the gate
  await supabase.from('batch_stage_sterilisation').upsert({
    batch_id: batchId,
    pass_fail: 'Pass',
  }, { onConflict: 'batch_id' });

  // Call the POST endpoint locally if it was running... but we can't. We can only call it directly if the next.js server is up. 
  // Let's just mock the EXACT code from route.js to see if it throws.
  const { validateParentStageTransition } = require('./lib/batches/stagePolicy');
  const transition = validateParentStageTransition({ 
    batch: { current_stage: 'sterilisation', status: 'in-progress' }, 
    fromStage: 'sterilisation', 
    toStage: 'inoculation' 
  });
  console.log('Transition Validation:', transition);
}
check();
