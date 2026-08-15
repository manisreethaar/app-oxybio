const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function getCols(tableName) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`, [tableName]);
  console.log(`\nTable: ${tableName}`);
  res.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
  await client.end();
}

async function run() {
  await getCols('batch_flask_endpoints');
  await getCols('batch_flask_straining');
  await getCols('batch_flask_extract_addition');
}
run();
