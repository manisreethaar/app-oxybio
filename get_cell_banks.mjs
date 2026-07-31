import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function check() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  await client.connect();

  const strains = await client.query(`SELECT id, name FROM cell_bank_strains`);
  console.log('Strains:', strains.rows);

  const preps = await client.query(`SELECT id, prep_code, type, strain_id FROM cell_bank_preparations WHERE type = 'MCB'`);
  console.log('MCB Preps:', preps.rows);

  await client.end();
}

check().catch(console.error);
