import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAdmin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('email, id');

    if (error) {
      console.error("DB Error:", error);
    } else {
      console.log("DB Success:", data);
    }
  } catch (err) {
    console.error("Crash:", err);
  }
}
test();
