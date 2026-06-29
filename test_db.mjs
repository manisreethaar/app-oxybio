import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await supabaseAdmin.from('payslips').select('*').limit(1);
  console.log('Payslips fetch:', data, error);
  
  if (data && data.length > 0) {
    console.log('Keys in first row:', Object.keys(data[0]));
  }
}

check();
