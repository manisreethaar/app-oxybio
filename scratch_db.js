const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data: emps, error: err1 } = await supabase.from('employees').select('id, email, full_name').limit(1);
  console.log('Employees:', emps, err1);

  const { data: notifs, error: err2 } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(2);
  console.log('Notifications:', notifs, err2);
}

test();
