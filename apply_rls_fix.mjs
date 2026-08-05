import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20260728000003_fix_titration_logs_rls.sql'), 'utf-8');
    const res = await client.query(sql);
    console.log('Migration applied successfully');
  } catch (err) {
    console.error('Error applying migration:', err);
  } finally {
    await client.end();
  }
}
run();
