require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function simulateBatch() {
  console.log('--- Starting Simulated Batch Run ---');
  
  // 1. Create a dummy formulation if none exists
  let formId;
  const { data: f } = await supabase.from('formulations').select('id').limit(1).maybeSingle();
  if (f) formId = f.id;
  else {
    const { data: newF } = await supabase.from('formulations').insert({
      name: 'Test Recipe', code: 'TEST-001', version: 1, status: 'Approved'
    }).select().single();
    formId = newF.id;
  }
  
  // 2. Create batch
  const batchIdStr = `TEST-${Date.now().toString().slice(-4)}`;
  const { data: batch, error: bErr } = await supabase.from('batches').insert({
    batch_id: batchIdStr, formulation_id: formId, experiment_type: 'F1', status: 'scheduled', current_stage: 'seed_1'
  }).select().single();
  if (bErr) return console.error('Failed to create batch:', bErr.message);
  console.log(`Created batch: ${batchIdStr}`);

  // 3. Create Seed 1 phase
  const { error: seed1Err } = await supabase.from('batch_seed_trains').insert({
    batch_id: batch.id, stage_type: 'seed_1', status: 'active'
  });
  if (seed1Err) return console.error('Failed to create Seed 1:', seed1Err.message);
  console.log('Initiated Seed 1');

  // 4. Test Transition Seed 1 -> Seed 2
  await supabase.from('batch_seed_trains').update({ status: 'completed' }).eq('batch_id', batch.id).eq('stage_type', 'seed_1');
  const { error: rpcErr1 } = await supabase.from('batch_seed_trains').insert({ batch_id: batch.id, stage_type: 'seed_2', status: 'active' });
  await supabase.from('batches').update({ current_stage: 'seed_2' }).eq('id', batch.id);
  if (rpcErr1) return console.error('Error (Seed1->Seed2):', rpcErr1.message);
  console.log('Transition Seed 1 -> Seed 2 successful');

  // 5. Test Transition Seed 2 -> Seed 3
  await supabase.from('batch_seed_trains').update({ status: 'completed' }).eq('batch_id', batch.id).eq('stage_type', 'seed_2');
  const { error: rpcErr2 } = await supabase.from('batch_seed_trains').insert({ batch_id: batch.id, stage_type: 'seed_3', status: 'active' });
  await supabase.from('batches').update({ current_stage: 'seed_3' }).eq('id', batch.id);
  if (rpcErr2) return console.error('Error (Seed2->Seed3):', rpcErr2.message);
  console.log('Transition Seed 2 -> Seed 3 successful');

  // 6. Test Transition Seed 3 -> Production
  await supabase.from('batch_seed_trains').update({ status: 'completed' }).eq('batch_id', batch.id).eq('stage_type', 'seed_3');
  const { error: rpcErr3 } = await supabase.from('batches').update({ current_stage: 'production' }).eq('id', batch.id);
  if (rpcErr3) return console.error('Error (Seed3->Production):', rpcErr3.message);
  console.log('Transition Seed 3 -> Production successful');
  
  console.log('--- Simulation Complete. All Upstream stage transitions passed! ---');
}
simulateBatch();
