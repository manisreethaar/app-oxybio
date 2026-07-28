import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function check() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.from('documents')
    .select('id, title, access_level')
    .or('access_level.eq.all-staff,access_level.is.null')
    .limit(3);
  
  console.log('Error:', error);
  console.log('Data length:', data?.length);
}
check();
