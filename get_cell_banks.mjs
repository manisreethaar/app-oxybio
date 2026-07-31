import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: preps, error: err2 } = await supabase
    .from('cell_bank_preparations')
    .select('prep_code')
    .order('prep_code', { ascending: false });
  console.log('All preps codes:', preps);
}

check().catch(console.error);
