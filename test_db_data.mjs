import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: bat } = await supabase.from('batches').select('batch_id').limit(50);
  console.log(`Batches count: ${bat?.length}`);
  
  const { data: act } = await supabase.from('activity_log').select('id').limit(50);
  console.log(`Activity log count: ${act?.length}`);
}
run();
