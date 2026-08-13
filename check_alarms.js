const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAlarms() {
  const { data, error } = await supabase
    .from('batch_fermentation_readings')
    .select('batch_id, flask_label, ph, is_ph_alarm')
    .eq('is_ph_alarm', true);

  if (error) {
    console.error('Error fetching readings:', error);
    return;
  }

  const uniqueBatches = new Set(data.map(d => d.batch_id));
  
  console.log(`Total readings with pH alarm: ${data.length}`);
  console.log(`Total unique batches with pH alarm: ${uniqueBatches.size}`);
  
  // optionally get batch info
  if (uniqueBatches.size > 0) {
    const { data: batches, error: bErr } = await supabase
      .from('batches')
      .select('batch_id')
      .in('id', Array.from(uniqueBatches));
      
    if (!bErr && batches) {
      console.log('Batches with alarm:', batches.map(b => b.batch_id));
    }
  }
}

checkAlarms();
