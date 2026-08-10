import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Client } from 'pg';
import fs from 'fs';

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const query = `
    SELECT
        c.conrelid::regclass AS table_name,
        c.conname AS constraint_name,
        a.attname AS column_name
    FROM
        pg_constraint c
    JOIN
        pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE
        c.contype = 'f'
        AND NOT EXISTS (
            SELECT 1
            FROM pg_index i
            WHERE i.indrelid = c.conrelid
              AND a.attnum = ANY(i.indkey)
        )
        AND c.connamespace = 'public'::regnamespace
    ORDER BY
        table_name, column_name;
  `;
  const res = await client.query(query);
  const rows = res.rows;
  console.log(`Found ${rows.length} unindexed foreign keys.`);
  
  let sql = `-- Migration to add missing foreign key indexes\n\n`;
  for (const row of rows) {
    const tableName = row.table_name;
    const colName = row.column_name;
    // Strip quotes if any
    const cleanTable = String(tableName).replace(/"/g, '');
    const idxName = `idx_${cleanTable}_${colName}`.substring(0, 63); // PG max length
    sql += `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${idxName} ON public.${tableName} (${colName});\n`;
  }
  
  fs.writeFileSync('supabase/migrations/20260805000001_add_missing_fk_indexes.sql', sql);
  console.log('Generated migration file: supabase/migrations/20260805000001_add_missing_fk_indexes.sql');
  await client.end();
}

run().catch(console.error);
