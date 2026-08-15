const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function investigate() {
  const { data: batch } = await supabase.from('batches').select('id, current_stage').eq('batch_id', 'OB-FER-26-009').single();
  console.log('Transitions for OB-FER-26-009:');
  const { data: transitions } = await supabase.from('stage_transitions').select('*').eq('batch_id', batch.id).order('created_at', { ascending: true });
  console.log(transitions);
}

investigate();
