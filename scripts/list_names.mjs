import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'e:/OXYBIO/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: dbEquipment, error } = await supabase.from('equipment').select('id, name');
  if (error) {
    console.error(error);
    return;
  }
  dbEquipment.forEach(e => console.log(e.name));
}

run().catch(console.error);
