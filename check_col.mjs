import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('activity_log').select('equipment_id').limit(1);
  if (error) {
    console.error('Error fetching equipment_id:', error.message);
  } else {
    console.log('Success, data:', data);
  }
}

test();
