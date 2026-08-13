const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixAlarms() {
  const { data, error } = await supabase
    .from('batch_fermentation_readings')
    .update({ is_ph_alarm: false })
    .gte('ph', 4)
    .lte('ph', 7)
    .eq('is_ph_alarm', true)
    .select();

  if (error) {
    console.error('Error fixing alarms:', error);
  } else {
    console.log(`Fixed ${data.length} old pH alarms that are within the new 4.0 - 7.0 range.`);
    data.forEach(d => console.log(`- Batch ${d.batch_id} Flask ${d.flask_label} pH ${d.ph}`));
  }
}

fixAlarms();
