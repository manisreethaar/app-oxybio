require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const sql = fs.readFileSync('supabase/migrations/20260728000001_titration_logs.sql', 'utf8');

  // Split on semicolons and run each statement individually
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 10 && !s.startsWith('--'));

  for (const stmt of statements) {
    console.log('Running:', stmt.substring(0, 60) + '...');
    const { error } = await supabase.rpc('exec_sql', { sql_text: stmt + ';' }).catch(() => ({ error: 'no rpc' }));
    if (error && error !== 'no rpc') console.warn('  warn:', error);
  }

  // Simpler: try using the Supabase SQL editor API directly via REST
  const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql_text: sql })
  });
  console.log('Response status:', resp.status);
  const body = await resp.text();
  console.log('Body:', body.slice(0, 300));
}

run().catch(console.error);
