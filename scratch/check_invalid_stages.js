const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('batches').select('id, current_stage');
  if (error) {
    console.error(error);
    return;
  }
  const uniqueStages = [...new Set(data.map(b => b.current_stage))];
  console.log('Unique stages in batches:', uniqueStages);
  
  const allowed = [
    'media_prep', 'sterilisation', 'inoculation', 'fermentation', 'harvest', 'straining',
    'qc_hold', 'released', 'rejected'
  ];
  const invalid = data.filter(b => b.current_stage && !allowed.includes(b.current_stage));
  console.log('Invalid batches:', invalid);
}
check();
