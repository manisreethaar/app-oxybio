import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await sb.from('titration_logs').insert({ 
    source_type: 'standalone', 
    sample_name: 'test', 
    acid_type: 'Lactic Acid', 
    equivalent_weight: 90.08, 
    titrant_normality: 0.1, 
    sample_volume_ml: 10, 
    initial_burette_ml: 0, 
    final_burette_ml: 2, 
    logged_by: '19c5a607-a003-456a-a9b4-551925daad80' 
  });
  console.log(data, error);
}
test();
