const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:6txNTjJvatLJHEey@db.eofhppcmdhhfrptbxmxd.supabase.co:5432/postgres' });
async function check() {
  await client.connect();
  const res = await client.query('SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies WHERE tablename IN (''batch_seed_trains'', ''batches'', ''batch_flasks'')');
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
check();
