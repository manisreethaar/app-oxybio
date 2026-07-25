import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function check() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  await client.connect();

  const res = await client.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'generate_gcs_code'
  `);
  console.log('generate_gcs_code definition:');
  console.log(res.rows[0]?.prosrc);

  await client.end();
}

check().catch(console.error);
