const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixDatabase() {
  console.log('Starting data correction script...');

  // 1. Reset OB-FER-26-009
  const { data: b009, error: err009 } = await supabase.from('batches').select('id, batch_id, current_stage').eq('batch_id', 'OB-FER-26-009').single();
  if (b009) {
    console.log(`Resetting batch ${b009.batch_id} to 'planned'...`);
    await supabase.from('batches').update({ current_stage: null, status: 'planned' }).eq('id', b009.id);
  }

  // 2. Fetch all batches and their inoculation/endpoints
  const { data: batches } = await supabase.from('batches').select('id, batch_id, start_time');
  const { data: inoculations } = await supabase.from('batch_flask_inoculations').select('batch_id, t_zero_time');
  const { data: endpoints } = await supabase.from('batch_flask_endpoints').select('id, batch_id, end_time, total_hours');

  // Process Endpoints (Missing end_time but has total_hours)
  for (const ep of endpoints) {
    if (!ep.end_time && ep.total_hours) {
      // Find t_zero_time for this batch
      const inocu = inoculations.find(i => i.batch_id === ep.batch_id);
      if (inocu && inocu.t_zero_time) {
        const tZero = new Date(inocu.t_zero_time);
        const newEndTime = new Date(tZero.getTime() + (ep.total_hours * 3600000));
        console.log(`Fixing Endpoint for batch ${ep.batch_id} - calculated end_time: ${newEndTime.toISOString()}`);
        await supabase.from('batch_flask_endpoints').update({ end_time: newEndTime.toISOString() }).eq('id', ep.id);
      }
    }
  }

  // Process Batches (Retrospective start_time > t_zero_time)
  for (const b of batches) {
    const inocu = inoculations.find(i => i.batch_id === b.id);
    if (b.start_time && inocu && inocu.t_zero_time) {
      const startTime = new Date(b.start_time);
      const tZero = new Date(inocu.t_zero_time);
      
      // If start_time is AFTER t_zero_time, the user entered it retrospectively.
      // We will backdate start_time to 24 hours BEFORE t_zero_time (simulating Media Prep).
      if (startTime > tZero) {
        const newStartTime = new Date(tZero.getTime() - (24 * 3600000));
        console.log(`Fixing Retrospective Batch ${b.batch_id} - backdating start_time to: ${newStartTime.toISOString()}`);
        await supabase.from('batches').update({ start_time: newStartTime.toISOString() }).eq('id', b.id);
      }
    }
  }

  console.log('Data correction complete.');
}

fixDatabase();
