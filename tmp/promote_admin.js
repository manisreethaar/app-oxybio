const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if(!supabaseUrl || !supabaseKey) { 
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function promoteAdmin() {
  const email = 'manisreethaar@gmail.com';
  console.log(`Promoting ${email} to admin...`);
  
  // Try to update existing profile
  const { data, error } = await supabase
    .from('employees')
    .update({ role: 'admin' })
    .eq('email', email)
    .select();

  if (error) {
    console.error('Error promoting admin:', error.message);
    if(error.message.includes('row-level security')) {
        console.warn("RLS is enabled. You might need to run this SQL in your Supabase dashboard directly:");
        console.log(`UPDATE employees SET role = 'admin' WHERE email = '${email}';`);
    }
  } else if (data && data.length > 0) {
    console.log('Success! Your account is now an admin.');
    console.log(data[0]);
  } else {
    console.warn('Profile not found. You may need to create your account first or run an INSERT SQL.');
    console.log(`Suggested SQL: INSERT INTO employees (email, full_name, role) VALUES ('${email}', 'User Name', 'admin');`);
  }
}

promoteAdmin();
