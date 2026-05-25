const { Client } = require('pg');
const client = new Client({
  connectionString: "postgres://postgres.ttikqclvbewkollnjvza:3bShNEHBT2DXYpda@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'formulations';
  `);
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
