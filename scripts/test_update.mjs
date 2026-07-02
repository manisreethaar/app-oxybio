import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'e:/OXYBIO/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase.from('equipment').update({ name: 'Test' }).eq('id', '28f92fe7-0747-4930-9e4c-10b634ae98ff').select();
  console.log('Update result:', data, error);
}

run().catch(console.error);
