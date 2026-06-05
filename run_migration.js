const fs = require('fs');
const { Client } = require('pg');

const env = fs.readFileSync('.env.production', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key] = val.trim().replace(/^\"|\"$/g, '');
  return acc;
}, {});

async function runMigration() {
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  const sql = fs.readFileSync('supabase/migrations/20260605000001_fix_notif_update.sql', 'utf8');
  
  try {
    await client.query(sql);
    console.log('Migration executed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

runMigration();
