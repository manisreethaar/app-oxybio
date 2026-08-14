const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});
const { Client } = require('pg');

async function checkPolicies() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not found");
    return;
  }
  
  // Note: the pg connection string points to db.eofhppcmdhhfrptbxmxd.supabase.co
  // Earlier we found it couldn't resolve DNS. Let's see if it works now, or we can use REST API.
  // Wait, REST API cannot query pg_policies directly unless exposed.
  // Can we query pg_policies via RPC? I wrote an RPC list earlier.
  // I will try connecting with pg first.
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query(`
      SELECT policyname, permissive, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename = 'batch_flask_extract_addition'
    `);
    console.log(res.rows);
  } catch (err) {
    console.error("Connection failed:", err.message);
  } finally {
    await client.end();
  }
}

checkPolicies();
