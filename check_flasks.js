const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:6txNTjJvatLJHEey@db.eofhppcmdhhfrptbxmxd.supabase.co:5432/postgres' });
async function run() {
  await client.connect();
  const res = await client.query("SELECT trigger_name, action_statement FROM information_schema.triggers WHERE event_object_table = 'batch_flasks'");
  console.log(res.rows);
  await client.end();
}
run();
