const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectDates() {
  const { data: batches } = await supabase.from('batches').select('id, batch_id, start_time');
  const { data: endpoints } = await supabase.from('batch_flask_endpoints').select('batch_id, end_time, total_hours');
  
  batches.forEach(b => {
    const eps = endpoints.filter(e => e.batch_id === b.id);
    if (eps.length > 0) {
      console.log(`\nBatch: ${b.batch_id}`);
      console.log(`  Start Time: ${b.start_time}`);
      eps.forEach(ep => {
        console.log(`  Endpoint End Time: ${ep.end_time} | Ferm Hrs: ${ep.total_hours}`);
      });
    }
  });
}

inspectDates();
