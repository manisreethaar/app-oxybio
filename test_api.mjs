import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAdmin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: employees } = await supabaseAdmin.from('employees').select('id, email, full_name, role');
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    
    console.log("Mismatched IDs:");
    employees.forEach(emp => {
      const authU = authUsers?.users?.find(u => u.email.toLowerCase() === emp.email.toLowerCase());
      if (authU && authU.id !== emp.id) {
        console.log(`- ${emp.email} (Role: ${emp.role})`);
        console.log(`  Employee ID: ${emp.id}`);
        console.log(`  Auth ID:     ${authU.id}`);
      }
    });

  } catch (err) {
    console.error("Crash:", err);
  }
}
test();
