const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:6txNTjJvatLJHEey@db.eofhppcmdhhfrptbxmxd.supabase.co:5432/postgres' });
async function run() {
  await client.connect();
  const res = await client.query("SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'batch_fermentation_readings'");
  console.log(res.rows);
  await client.end();
}
run();
