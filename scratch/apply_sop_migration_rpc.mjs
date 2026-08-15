import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const query = `
    ALTER TABLE sop_acknowledgements 
      ADD COLUMN IF NOT EXISTS pin_verified BOOLEAN DEFAULT false;

    ALTER TABLE sop_library 
      ADD COLUMN IF NOT EXISTS effective_date DATE;
  `;

  const { data, error } = await supabase.rpc('exec_sql', { query });
  console.log("exec_sql result:", data, error);
}
run();
