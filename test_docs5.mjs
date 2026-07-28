import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('documents').select('*, employees(full_name, initials)');
  console.log('Query result:', data ? data.length : null, 'Error:', error);
  if (data && data.length > 0) console.log(data[0]);
}
test();
