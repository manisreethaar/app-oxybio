import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await supabaseAdmin.from('employees').select('id, email, role').eq('id', '2e14d5dd-b502-4f6b-8fa8-5519a681470a');
  console.log('User:', data, error);
}

check();
