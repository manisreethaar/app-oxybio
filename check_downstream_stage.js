const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkOldBatches() {
  const { data: batches } = await supabase
    .from('batches')
    .select('id, batch_id, current_stage, status')
    .ilike('current_stage', '%downstream%');
    
  console.log('Batches with current_stage downstream:', batches);
  
  const { data: batches2 } = await supabase
    .from('batches')
    .select('id, batch_id, current_stage, status')
    .ilike('status', '%downstream%');
    
  console.log('Batches with status downstream:', batches2);
}
checkOldBatches();
