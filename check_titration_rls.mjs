import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT policyname, permissive, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename = 'titration_logs';
    `);
    console.log('Policies:', res.rows);
    
    const is_admin_res = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'is_admin';
    `);
    console.log('is_admin:', is_admin_res.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
run();
