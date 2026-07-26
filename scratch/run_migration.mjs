import { Client } from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8')
  .split('\n')
  .reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      acc[parts[0]] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    }
    return acc;
  }, {});

const client = new Client({
  connectionString: env.DATABASE_URL
});

async function run() {
  await client.connect();
  console.log("Connected to database.");
  
  const sql = fs.readFileSync('supabase/migrations/20260726000000_global_alcoa_gdp_remediation.sql', 'utf8');
  console.log("Executing SQL migration...");
  
  try {
    await client.query(sql);
    console.log("Migration executed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

run();
