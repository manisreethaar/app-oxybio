process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
const client = new Client({
  connectionString: "postgres://postgres.ttikqclvbewkollnjvza:3bShNEHBT2DXYpda@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public';
  `);
  console.log('Tables:', res.rows.map(r => r.table_name));
  await client.end();
}
run().catch(console.error);
