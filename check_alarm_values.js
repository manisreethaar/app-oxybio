const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAlarmValues() {
  const { data, error } = await supabase
    .from('batch_fermentation_readings')
    .select('batch_id, flask_label, ph')
    .eq('is_ph_alarm', true);

  if (error) {
    console.error('Error fetching readings:', error);
    return;
  }

  // Fetch batch details to map batch_id -> human readable batch ID
  const uniqueBatches = Array.from(new Set(data.map(d => d.batch_id)));
  const { data: batches } = await supabase
    .from('batches')
    .select('id, batch_id')
    .in('id', uniqueBatches);
    
  const batchMap = {};
  if (batches) {
    batches.forEach(b => batchMap[b.id] = b.batch_id);
  }

  console.log('pH values that triggered alarms:');
  data.forEach(d => {
    console.log(`Batch: ${batchMap[d.batch_id] || d.batch_id}, Flask: ${d.flask_label}, pH: ${d.ph}`);
  });
}

checkAlarmValues();
