const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const supabase = createClient(
  'https://eofhppcmdhhfrptbxmxd.supabase.co',
  'sb_publishable_YBzhSR__ZzmgS2kgUHlH1w_VrJR96BF'
);

const pwd = encodeURIComponent('#@Yiruom1311');
const dbUrl = `postgresql://postgres:${pwd}@db.eofhppcmdhhfrptbxmxd.supabase.co:5432/postgres`;

async function main() {
  /*
  console.log('Signing up auth user...');
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: 'manisreethaar@gmail.com',
    password: 'OxybioPassword2026!'
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      console.log('Auth user already exists.');
    } else {
      console.error('Auth error:', authError);
      return;
    }
  } else {
    console.log('Auth user created successfully.');
  }
  */

  console.log('Connecting to postgres...');
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  console.log('Inserting into employees table...');
  try {
    const res = await client.query(`
      INSERT INTO employees (email, full_name, role, department, joined_date, is_active)
      VALUES ('manisreethaar@gmail.com', 'Oxygen Founder', 'admin', 'Management', CURRENT_DATE, true)
      ON CONFLICT (email) DO UPDATE SET role = 'admin', is_active = true;
    `);
    console.log('Admin employee record created/updated successfully.');
  } catch (err) {
    console.error('DB error:', err);
  } finally {
    await client.end();
  }
}

main();
