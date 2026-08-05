import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const supabaseService = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  // Get an admin user and a regular user
  const { data: admins } = await supabaseService.from('employees').select('email').eq('role', 'admin').limit(1);
  const { data: users } = await supabaseService.from('employees').select('email').neq('role', 'admin').limit(1);
  
  console.log('Admin:', admins[0]?.email);
  console.log('User:', users[0]?.email);
  
  // We can't easily sign in without passwords, but we can impersonate using RLS with run_sql or similar if we use pg.
  // Wait, I can generate a JWT for the admin using supabase-js if I set up a custom token, but it's hard.
  // Instead, I'll update run_sql.mjs to execute a query as the admin role.
}
run();
