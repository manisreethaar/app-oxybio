const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testRpc() {
  const { data: flask } = await supabase.from('batch_flasks').select('id, flask_label, batch_id').eq('current_stage', 'extract_addition').order('created_at', { ascending: false }).limit(1).single();
  
  if (!flask) return console.log('No flask');
  console.log('Flask:', flask.flask_label, flask.id);

  const { data: batch } = await supabase.from('batches').select('id').eq('id', flask.batch_id).single();
  if (!batch) return console.log('No batch for this flask');
  console.log('Batch:', batch.id);

  const { data: emp } = await supabase.from('employees').select('id').limit(1).single();
  
  const { data, error } = await supabase.rpc('advance_flask_stage', {
    p_flask_id: flask.id,
    p_batch_id: batch.id,
    p_to_stage: 'qc_hold',
    p_employee_id: emp.id,
    p_flask_label: flask.flask_label
  });
  console.log('Result:', JSON.stringify(data));
  console.log('Error:', error);
}
testRpc();
