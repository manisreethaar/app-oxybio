const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if(!supabaseUrl || !supabaseKey) { 
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function upsertAdmin() {
  const email = 'manisreethaar@gmail.com';
  console.log(`Checking profile for ${email}...`);
  
  // Try to find the user in auth to get their ID (optional but good)
  // Since we are using the anon key, we probably can't see the full auth user list,
  // but we can try to insert based on email which is unique in most of our logic.

  const { data: existing, error: findError } = await supabase
    .from('employees')
    .select('id')
    .eq('email', email)
    .single();

  if (existing) {
    console.log('Profile exists. Updating to admin...');
    const { error } = await supabase
        .from('employees')
        .update({ role: 'admin' })
        .eq('email', email);
    if (error) console.error('Update error:', error.message);
    else console.log('Successfully promoted to admin!');
  } else {
    console.log('Profile does not exist. Creating admin profile...');
    const { error } = await supabase
        .from('employees')
        .insert({
            email: email,
            full_name: 'System Admin',
            role: 'admin',
            department: 'Admin',
            designation: 'CEO / CTO',
            is_active: true,
            employee_code: 'O2B-AD-001'
        });
    if (error) {
        console.error('Insert error:', error.message);
        console.log('If you get RLS errors, please run this inside Supabase SQL Editor:');
        console.log(`INSERT INTO employees (email, full_name, role, department, designation, employee_code, is_active) 
VALUES ('${email}', 'System Admin', 'admin', 'Admin', 'CEO / CTO', 'O2B-AD-001', true);`);
    } else {
        console.log('Successfully created admin profile!');
    }
  }
}

upsertAdmin();
