import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const batchId = '27288930-063e-4db2-874e-2d6db7ba25d0';
  console.log('Testing queries with SERVICE ROLE KEY for batchId:', batchId);
  
  const batchRes = await supabase.from('batches').select('*, formulations(id, name, code, version, ingredients, base_volume_ml)').eq('id', batchId);
  
  console.log('Batch rows:', batchRes.data ? batchRes.data.length : 0);
  if (batchRes.error) console.log('Error:', batchRes.error);
}

test();
