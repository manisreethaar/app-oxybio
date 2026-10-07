import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const tables = ['batches', 'batch_seed_trains', 'batch_flasks', 'batch_fermentation_readings', 'batch_yield_metrics'];
  
  for (const t of tables) {
    const { data } = await supabase.from(t).select('*').limit(1);
    console.log(`\n--- ${t} ---`);
    if (data && data.length > 0) {
      console.log(Object.keys(data[0]).join(', '));
    } else {
      console.log('No data');
    }
  }
}
run();
