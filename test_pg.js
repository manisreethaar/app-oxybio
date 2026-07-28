const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  const res = await pool.query(`
    SELECT polname, polcmd, polroles, polqual
    FROM pg_policy
    WHERE polrelid = 'public.documents'::regclass;
  `);

  console.log(res.rows);
  await pool.end();
}

run();
