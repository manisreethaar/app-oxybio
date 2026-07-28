require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    await client.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS pm_frequency_days INTEGER;`);
    await client.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS next_pm_date DATE;`);
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}
runMigration();
