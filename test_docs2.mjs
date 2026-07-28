import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'document_categories').single();
  console.log('App settings categories:', settings);

  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  console.log('Users:', users?.users?.length, userError);

  const { data: docs } = await supabase.from('documents').select('*');
  console.log('Total documents in DB:', docs?.length);
  const categories = [...new Set(docs?.map(d => d.category))];
  console.log('Unique categories in DB:', categories);
}
test();
