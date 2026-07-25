import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: latest, error: err1 } = await supabase
    .from('growth_studies')
    .select('study_code')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Latest studies:', latest);

  const { data: nextCode, error: err2 } = await supabase.rpc('generate_gcs_code');
  console.log('Next code from RPC:', nextCode, err2);
}

check().catch(console.error);
