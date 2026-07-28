import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;

async function test() {
  if (!jwtSecret) {
    console.error('No JWT secret found');
    return;
  }
  
  const adminClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: users } = await adminClient.from('employees').select('*').limit(3);
  console.log('Testing with user:', users[0].email, users[0].role);

  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    sub: users[0].id,
    email: users[0].email,
    app_metadata: {},
    user_metadata: {},
    exp: Math.floor(Date.now() / 1000) + 60 * 60
  };

  const token = jwt.sign(payload, jwtSecret);
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });

  const { data, error } = await userClient.from('documents').select('*, employees(full_name, initials)');
  console.log('Docs fetched as user:', data?.length, 'Error:', error);
}
test();
