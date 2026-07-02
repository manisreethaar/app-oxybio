const fs = require('fs');
const { Client } = require('pg');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...valParts] = line.split('=');
  if (key && valParts.length) acc[key] = valParts.join('=').trim().replace(/^\"|\"$/g, '');
  return acc;
}, {});

async function run() {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    const res = await client.query(`
      SELECT tablename, policyname, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename LIKE 'cell_bank_%';
    `);
    console.log('POLICIES:', res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
run();
