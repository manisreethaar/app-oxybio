import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('titration_logs').select('*, logger:employees!titration_logs_logged_by_fkey(full_name, initials, role)');
  console.log("Total entries:", data?.length);
  if (error) console.error(error);
  if (data && data.length > 0) {
    console.log("Sample of entries:", data.slice(0, 3));
  }
}
run();
