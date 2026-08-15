import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) {
    console.error('No DB URL found');
    return;
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      ALTER TABLE sop_acknowledgements 
        ADD COLUMN IF NOT EXISTS pin_verified BOOLEAN DEFAULT false;

      ALTER TABLE sop_library 
        ADD COLUMN IF NOT EXISTS effective_date DATE;
    `);
    console.log('Success:', res);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
run();
