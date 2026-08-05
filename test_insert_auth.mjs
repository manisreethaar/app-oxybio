import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

// We get token from test_queries2.mjs logic
const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function run() {
  const sb = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  // Login (just using test@oxybio.com which is in test_queries2.mjs)
  const { data: authData, error: authError } = await sb.auth.signInWithPassword({
    email: 'test@oxybio.com',
    password: 'password123'
  });
  
  if (authError) {
    console.log('Login failed:', authError);
    return;
  }
  console.log('Logged in as', authData.user.email);
  
  const payload = {
    source_type: 'standalone',
    source_id: null,
    source_label: null,
    sample_name: 'test debug',
    acid_type: 'Lactic Acid',
    equivalent_weight: 90.08,
    titrant_normality: 0.1,
    sample_volume_ml: 10,
    initial_burette_ml: 0,
    final_burette_ml: 2,
    logged_by: '19c5a607-a003-456a-a9b4-551925daad80',
    sampled_at: new Date().toISOString()
  };
  
  const { data, error } = await sb.from('titration_logs').insert(payload).select().single();
  console.log('Insert Result Data:', data);
  console.log('Insert Result Error:', error);
}

run();
