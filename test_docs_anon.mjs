import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function test() {
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await anonClient.from('documents').select('id, title').limit(5);
  console.log('Unauthenticated Fetch:');
  console.log('Data:', data);
  console.log('Error:', error);
}
test();
