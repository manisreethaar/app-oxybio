const fs = require('fs');
const { Client } = require('pg');

const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});

async function runMigration() {
  const sql = fs.readFileSync('supabase/migrations/20260813000001_add_pellet_rtd_to_extract_addition.sql', 'utf8');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    console.log('Connected to database.');
    await client.query(sql);
    console.log('Migration applied successfully.');
    
    // Call Supabase RPC to reload schema cache if necessary (often happens automatically on DDL though, or via PostgREST schema cache reload)
    // NOTIFY pgrst, 'reload schema'
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('Schema cache reloaded.');
  } catch (err) {
    console.error('Error applying migration:', err);
  } finally {
    await client.end();
  }
}

runMigration();
