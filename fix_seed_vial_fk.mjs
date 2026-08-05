import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Fix the FK on seed_passages.vial_id to point to cell_bank_vials instead of inventory
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const sql = `
-- Fix seed_passages.vial_id FK: drop old constraint (points to inventory),
-- add new one pointing to cell_bank_vials
ALTER TABLE seed_passages DROP CONSTRAINT IF EXISTS seed_passages_vial_id_fkey;
ALTER TABLE seed_passages 
  ADD CONSTRAINT seed_passages_vial_id_fkey 
  FOREIGN KEY (vial_id) 
  REFERENCES cell_bank_vials(id) 
  ON DELETE SET NULL;

-- Reload PostgREST schema cache so joins work immediately
NOTIFY pgrst, 'reload schema';
`;

const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(() => ({ data: null, error: { message: 'exec_sql RPC not available' } }));

if (error) {
  // Try alternative: run each statement via direct query
  console.log('RPC not available, trying direct queries...');
  
  const statements = [
    `ALTER TABLE seed_passages DROP CONSTRAINT IF EXISTS seed_passages_vial_id_fkey`,
    `ALTER TABLE seed_passages ADD CONSTRAINT seed_passages_vial_id_fkey FOREIGN KEY (vial_id) REFERENCES cell_bank_vials(id) ON DELETE SET NULL`,
    `NOTIFY pgrst, 'reload schema'`,
  ];
  
  for (const stmt of statements) {
    const { error: e } = await supabase.rpc('exec', { sql: stmt }).catch(() => ({ error: { message: 'exec RPC not available' } }));
    if (e) {
      console.error(`Failed: ${stmt.substring(0, 60)}...`);
      console.error('Error:', e.message);
    } else {
      console.log(`OK: ${stmt.substring(0, 60)}...`);
    }
  }
} else {
  console.log('Migration successful!', data);
}
