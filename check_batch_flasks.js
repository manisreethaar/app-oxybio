const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: batches, error } = await supabase.from('batches').select('id, lot_number, current_stage');
  if (error) return console.log('Error:', error);
  const batch = batches.find(b => b.lot_number && b.lot_number.includes('H44-A333'));
  if (!batch) return console.log('no batch');
  
  console.log('Batch:', batch.lot_number, 'Stage:', batch.current_stage);
  const { data: flasks } = await supabase.from('batch_flasks').select('flask_label, current_stage, status').eq('batch_id', batch.id);
  console.log('Flasks:', flasks);
}
check();
