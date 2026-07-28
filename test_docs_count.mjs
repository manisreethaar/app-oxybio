import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function check() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.from('documents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  
  console.log('Error:', error);
  console.log('Count:', data?.length);
  console.log('Recent docs:', data.map(d => ({
    id: d.id, title: d.title, category: d.category, access_level: d.access_level, uploaded_by: d.uploaded_by, created_at: d.created_at
  })));
}
check();
