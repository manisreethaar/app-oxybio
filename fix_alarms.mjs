import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixAlarms() {
  const { data: readings, error } = await supabaseAdmin
    .from('batch_fermentation_readings')
    .select('id, batch_id, ph, is_ph_alarm');

  if (error) {
    console.error("Error fetching readings:", error);
    return;
  }

  let updatedCount = 0;

  for (const r of readings) {
    if (!r.ph) continue;
    const phNum = parseFloat(r.ph);
    const newAlarmStatus = phNum < 3 || phNum > 6.5;

    if (r.is_ph_alarm !== newAlarmStatus) {
      console.log(`Updating reading ID ${r.id} for batch ${r.batch_id} (pH=${r.ph}): alarm ${r.is_ph_alarm} -> ${newAlarmStatus}`);
      await supabaseAdmin
        .from('batch_fermentation_readings')
        .update({ is_ph_alarm: newAlarmStatus })
        .eq('id', r.id);
      
      updatedCount++;
    }
  }

  // If any readings were fixed, we should also clear has_alarm on the batch if it no longer has alarms
  if (updatedCount > 0) {
    console.log("Recalculating batch has_alarm flags...");
    const { data: batches } = await supabaseAdmin.from('batches').select('id, batch_id, has_alarm').eq('status', 'in-progress');
    
    for (const batch of batches || []) {
      const { data: batchReadings } = await supabaseAdmin
        .from('batch_fermentation_readings')
        .select('is_ph_alarm, is_temp_alarm')
        .eq('batch_id', batch.id);
        
      const stillHasAlarm = batchReadings?.some(br => br.is_ph_alarm || br.is_temp_alarm);
      
      if (batch.has_alarm !== stillHasAlarm) {
         console.log(`Updating batch ${batch.batch_id} has_alarm to ${stillHasAlarm}`);
         // NOTE: Actually, in this codebase has_alarm seems to be evaluated dynamically in page.js based on reading the readings directly,
         // but if the column exists we might as well update it just in case. Wait, I saw has_alarm queried in batches/page.js. Let's update it if the column exists.
         const { error } = await supabaseAdmin.from('batches').update({ has_alarm: stillHasAlarm }).eq('id', batch.id);
         if (error && error.code === 'PGRST204') {
             // Column might not exist or other error, ignore
         }
      }
    }
  }

  console.log(`Done. Updated ${updatedCount} readings.`);
}

fixAlarms();
