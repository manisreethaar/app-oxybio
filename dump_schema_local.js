const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function dumpSchema() {
  const dns = require('dns');
  dns.setDefaultResultOrder('ipv6first');

  const poolerUrl = 'postgresql://postgres.eofhppcmdhhfrptbxmxd:6txNTjJvatLJHEey@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
  let client = new Client({ connectionString: poolerUrl });
  try {
    await client.connect();
    console.log("Connected to ap-south-1 pooler");
  } catch (e) {
    console.log("Failed ap-south-1, trying us-east-1...");
    client = new Client({ connectionString: 'postgresql://postgres.eofhppcmdhhfrptbxmxd:6txNTjJvatLJHEey@aws-0-us-east-1.pooler.supabase.com:6543/postgres' });
    await client.connect();
    console.log("Connected to us-east-1 pooler");
  }
  
  const tablesRes = await client.query(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);
  
  let dump = '-- Supabase Schema Dump (Generated via Node script)\n\n';

  for (const row of tablesRes.rows) {
    const table = row.tablename;
    dump += `CREATE TABLE public.${table} (\n`;
    
    const colsRes = await client.query(`
      SELECT column_name, data_type, character_maximum_length, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, [table]);
    
    const colLines = colsRes.rows.map(c => {
      let line = `  ${c.column_name} ${c.data_type}`;
      if (c.character_maximum_length) line += `(${c.character_maximum_length})`;
      if (c.is_nullable === 'NO') line += ' NOT NULL';
      if (c.column_default) line += ` DEFAULT ${c.column_default}`;
      return line;
    });
    
    dump += colLines.join(',\n') + '\n);\n\n';
  }
  
  fs.writeFileSync('schema_dump.sql', dump);
  console.log('Schema dumped to schema_dump.sql');
  await client.end();
}

dumpSchema().catch(console.error);
