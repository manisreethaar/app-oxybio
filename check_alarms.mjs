import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAlarms() {
  const { data: readings, error } = await supabaseAdmin
    .from('batch_fermentation_readings')
    .select('id, batch_id, ph, is_ph_alarm, incubator_temp_c, is_temp_alarm, logged_at')
    .or('is_ph_alarm.eq.true,is_temp_alarm.eq.true');

  if (error) {
    console.error("Error fetching readings:", error);
    return;
  }

  if (readings.length === 0) {
    console.log("No alarm readings found in the database.");
  } else {
    for (const r of readings) {
      const { data: batch } = await supabaseAdmin.from('batches').select('batch_id, status').eq('id', r.batch_id).single();
      console.log(`Alarm on Batch ${batch?.batch_id} (Status: ${batch?.status}): PH=${r.ph} (PH Alarm: ${r.is_ph_alarm}), Temp=${r.incubator_temp_c} (Temp Alarm: ${r.is_temp_alarm}), Logged: ${r.logged_at}`);
    }
  }

  // Also check if any batch has has_alarm column set directly (if such a column exists)
  const { data: batchesWithAlarm } = await supabaseAdmin
    .from('batches')
    .select('batch_id, has_alarm')
    .eq('has_alarm', true)
    .catch(e => { return { data: null }});

  if (batchesWithAlarm && batchesWithAlarm.length > 0) {
    console.log("Batches with has_alarm=true column:", batchesWithAlarm.map(b => b.batch_id).join(", "));
  } else {
    console.log("No batches with has_alarm=true column found.");
  }
}

checkAlarms();
