import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Fetching logs to delete...");
  const { data: logs, error: fetchErr } = await supabase.from('titration_logs').select('id');
  
  if (fetchErr) {
    console.error("Fetch error:", fetchErr);
    return;
  }
  
  if (!logs || logs.length === 0) {
    console.log("No entries found to delete.");
    return;
  }
  
  console.log(`Found ${logs.length} entries. Deleting...`);
  
  // Extract IDs
  const ids = logs.map(l => l.id);
  
  const { error: delErr } = await supabase.from('titration_logs').delete().in('id', ids);
  
  if (delErr) {
    console.error("Delete error:", delErr);
  } else {
    console.log(`Successfully deleted ${logs.length} entries.`);
  }
}
run();
