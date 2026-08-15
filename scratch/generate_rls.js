const fs = require('fs');
const schema = fs.readFileSync('schema_dump.sql', 'utf8');
const tables = [];
const regex = /CREATE TABLE public\."([^"]+)"/g;
let match;
while ((match = regex.exec(schema)) !== null) {
  tables.push(match[1]);
}

const regex2 = /CREATE TABLE public\.([a-zA-Z0-9_]+) \(/g;
while ((match = regex2.exec(schema)) !== null) {
  tables.push(match[1]);
}

const uniqueTables = [...new Set(tables)];

let sql = `-- Master RLS Fix for OXYBIO\n-- This grants read/write access to ALL authenticated users for ALL tables.\n\n`;

for (const t of uniqueTables) {
  sql += `ALTER TABLE public."${t}" ENABLE ROW LEVEL SECURITY;\n`;
  sql += `DROP POLICY IF EXISTS "${t}_auth_all" ON public."${t}";\n`;
  sql += `CREATE POLICY "${t}_auth_all" ON public."${t}" FOR ALL TO authenticated USING (true) WITH CHECK (true);\n\n`;
}

fs.writeFileSync('master_rls_fix.sql', sql);
console.log(`Generated RLS fixes for ${uniqueTables.length} tables in master_rls_fix.sql`);
