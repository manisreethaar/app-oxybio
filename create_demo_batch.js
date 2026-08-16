require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function seedDemoBatch() {
  const empId = 'b495c4c9-cd83-4558-9886-5ba34902a1e0'; // ABINAYA S
  const batchId = uuidv4();
  
  console.log('Seeding Demo Batch...');

  // 1. Insert Batch
  const { error: bErr } = await supabase.from('batches').insert({
    id: batchId,
    batch_id: 'DEMO-TIER1-D',
    status: 'fermenting',
    current_stage: 'production',
    num_flasks: 3,
    planned_volume_ml: 10000,
    created_by: empId,
    updated_by: empId,
    start_time: new Date(Date.now() - 48 * 3600000).toISOString()
  });
  if (bErr) throw bErr;

  // 2. Insert Seed Trains
  const seed1Id = uuidv4();
  const prodId = uuidv4();
  
  const { error: stErr } = await supabase.from('batch_seed_trains').insert([
    {
      id: seed1Id,
      batch_id: batchId,
      stage_type: 'seed_1',
      status: 'completed',
      is_sterilised: true,
      sterilizer_equipment_id: 'AC-101',
      sterilization_temp_c: 121,
      sterilization_duration_mins: 30,
      sterilised_at: new Date(Date.now() - 47 * 3600000).toISOString(),
      inoculated_at: new Date(Date.now() - 46 * 3600000).toISOString(),
      inventory_deduction_status: 'completed'
    },
    {
      id: prodId,
      batch_id: batchId,
      stage_type: 'production',
      status: 'active',
      is_sterilised: true,
      sterilizer_equipment_id: 'AC-202',
      sterilization_temp_c: 121,
      sterilization_duration_mins: 45,
      sterilised_at: new Date(Date.now() - 10 * 3600000).toISOString(),
      inoculated_at: new Date(Date.now() - 8 * 3600000).toISOString(),
      inventory_deduction_status: 'completed'
    }
  ]);
  if (stErr) throw stErr;

  // 3. Insert Flasks
  const s1f1 = uuidv4();
  const s1f2 = uuidv4();
  const pf1 = uuidv4();
  const pf2 = uuidv4();
  const pf3 = uuidv4();

  const { error: fErr } = await supabase.from('batch_flasks').insert([
    {
      id: s1f1, batch_id: batchId, seed_train_id: seed1Id, flask_label: 'S1-F1', flask_full_id: 'DEMO-TIER1-D-S1-F1',
      current_stage: 'straining', status: 'active',
      incubator_equipment_id: 'INC-101', incubation_temp_c: 37, incubation_agitation_rpm: 150,
      inoculated_at: new Date(Date.now() - 46 * 3600000).toISOString()
    },
    {
      id: s1f2, batch_id: batchId, seed_train_id: seed1Id, flask_label: 'S1-F2', flask_full_id: 'DEMO-TIER1-D-S1-F2',
      current_stage: 'straining', status: 'active',
      incubator_equipment_id: 'INC-101', incubation_temp_c: 37, incubation_agitation_rpm: 150,
      inoculated_at: new Date(Date.now() - 46 * 3600000).toISOString()
    },
    {
      id: pf1, batch_id: batchId, seed_train_id: prodId, flask_label: 'Prod-F1', flask_full_id: 'DEMO-TIER1-D-Prod-F1',
      current_stage: 'fermentation', status: 'active',
      incubator_equipment_id: 'BIO-50L-A', incubation_temp_c: 37.5, incubation_agitation_rpm: 250,
      inoculated_at: new Date(Date.now() - 8 * 3600000).toISOString()
    },
    {
      id: pf2, batch_id: batchId, seed_train_id: prodId, flask_label: 'Prod-F2', flask_full_id: 'DEMO-TIER1-D-Prod-F2',
      current_stage: 'fermentation', status: 'active',
      incubator_equipment_id: 'BIO-50L-B', incubation_temp_c: 37.5, incubation_agitation_rpm: 250,
      inoculated_at: new Date(Date.now() - 8 * 3600000).toISOString()
    },
    {
      id: pf3, batch_id: batchId, seed_train_id: prodId, flask_label: 'Prod-F3', flask_full_id: 'DEMO-TIER1-D-Prod-F3',
      current_stage: 'fermentation', status: 'active',
      incubator_equipment_id: 'BIO-50L-C', incubation_temp_c: 37.5, incubation_agitation_rpm: 250,
      inoculated_at: new Date(Date.now() - 8 * 3600000).toISOString()
    }
  ]);
  if (fErr) throw fErr;

  // 4. Insert Readings
  const { error: rErr } = await supabase.from('batch_fermentation_readings').insert([
    {
      batch_id: batchId, seed_train_id: seed1Id, flask_id: s1f1,
      ph: 7.2, optical_density: 0.8,
      logged_by: empId,
      logged_at: new Date(Date.now() - 36 * 3600000).toISOString()
    },
    {
      batch_id: batchId, seed_train_id: seed1Id, flask_id: s1f2,
      ph: 7.1, optical_density: 0.9, microscopic_test: 'Gram positive, cocci',
      logged_by: empId,
      logged_at: new Date(Date.now() - 36 * 3600000).toISOString()
    },
    {
      batch_id: batchId, seed_train_id: prodId, flask_id: pf1,
      ph: 7.4, optical_density: 0.2,
      logged_by: empId,
      logged_at: new Date(Date.now() - 6 * 3600000).toISOString()
    },
    {
      batch_id: batchId, seed_train_id: prodId, flask_id: pf2,
      ph: 7.3, optical_density: 0.25,
      logged_by: empId,
      logged_at: new Date(Date.now() - 6 * 3600000).toISOString()
    },
    {
      batch_id: batchId, seed_train_id: prodId, flask_id: pf1,
      ph: 6.8, optical_density: 4.5,
      logged_by: empId,
      logged_at: new Date(Date.now() - 1 * 3600000).toISOString()
    }
  ]);
  if (rErr) throw rErr;

  console.log('Successfully seeded DEMO-TIER1 batch!');
  console.log('Batch ID:', batchId);
}

seedDemoBatch().catch(console.error);
