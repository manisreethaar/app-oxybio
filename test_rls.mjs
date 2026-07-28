import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function check() {
  const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data, error } = await adminSupabase
    .from('documents')
    .select('id, title'); // test connection
  
  if (error) {
    console.error(error);
  } else {
    console.log("Documents query via admin works. Getting policies...");
    
    // We can't query pg_policies directly via REST unless exposed. 
    // Wait, let's use the postgres client!
  }
}
check();
