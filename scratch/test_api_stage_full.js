const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const batchId = 'e759e888-6cbc-4483-b608-e6031fbc186a';
  const { data: emp } = await supabase.from('employees').select('id').limit(1).single();
  const empId = emp.id;

  // Update batch
  const { error: updateErr } = await supabase
    .from('batches')
    .update({ current_stage: 'sterilisation', status: 'in-progress' })
    .eq('id', batchId);
  
  if (updateErr) {
    console.log('Update Error:', updateErr);
    return;
  }

  // Insert audit trail
  const { error: auditErr } = await supabase.from('stage_transitions').insert({
    batch_id: batchId, 
    from_stage: 'media_prep', 
    to_stage: 'sterilisation', 
    changed_by: empId, 
    notes: ''
  });

  if (auditErr) {
    console.log('Audit Error:', auditErr);
    return;
  }
  
  console.log('Transition logic completed without database errors.');
}
check();
