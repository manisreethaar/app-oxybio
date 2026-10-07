const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:6txNTjJvatLJHEey@db.eofhppcmdhhfrptbxmxd.supabase.co:5432/postgres' });
async function run() {
  await client.connect();
  const res = await client.query("SELECT tablename, cmd, roles, qual, with_check FROM pg_policies WHERE tablename IN ('inventory_stock', 'inventory_transactions')");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
run();
