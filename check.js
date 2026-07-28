require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  const res = await client.query("SELECT constraint_name, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'calibration_logs'::regclass;");
  console.log(res.rows);
  client.end();
}).catch(console.error);
