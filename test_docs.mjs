import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDocs() {
  const { data, error } = await supabase.from('documents').select('*').limit(5);
  console.log('Docs:', data, error);

  // let's test insert
  const { data: insertData, error: insertError } = await supabase.from('documents').insert({
    title: 'Test Doc',
    category: 'Finance',
    version: '1.0',
    file_url: 'https://test.com',
    access_level: 'all-staff'
  });
  console.log('Insert:', insertData, insertError);
}
checkDocs();
