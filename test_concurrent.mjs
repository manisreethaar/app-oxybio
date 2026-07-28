import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const start = Date.now();
  console.log(`Starting 20 concurrent queries...`);
  
  const promises = Array.from({ length: 20 }).map((_, i) => {
    return supabase
      .from('activity_log')
      .select('id')
      .limit(1)
      .then(() => Date.now() - start);
  });

  try {
    const results = await Promise.all(promises);
    console.log(`Completed in ${Date.now() - start}ms. Result times:`, results);
  } catch (e) {
    console.log(`Crashed in ${Date.now() - start}ms:`, e.message);
  }
}

run();
