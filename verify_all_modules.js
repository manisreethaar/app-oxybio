const fs = require('fs');
const path = require('path');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function findTables(dir, tables = new Set()) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findTables(fullPath, tables);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.ts') || fullPath.endsWith('.jsx') || fullPath.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.matchAll(/from\(['"]([a-zA-Z0-9_]+)['"]\)/g);
      for (const match of matches) {
        tables.add(match[1]);
      }
    }
  }
  return tables;
}

async function verifyAll() {
  const tables = Array.from(findTables(path.join(__dirname, 'app')));
  console.log(`Found ${tables.length} unique table references in the codebase.`);
  
  const missing = [];
  const valid = [];
  const errors = [];

  for (const table of tables) {
    const { error } = await supabase.from(table).select('*').limit(0);
    if (error) {
      if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
        missing.push(table);
      } else {
        errors.push({ table, error: error.message });
      }
    } else {
      valid.push(table);
    }
  }
  
  console.log(`\nVerified ${valid.length} tables successfully.`);
  if (missing.length > 0) {
    console.error(`\n❌ MISSING TABLES (${missing.length}):\n${missing.join('\n')}`);
  }
  if (errors.length > 0) {
    console.error(`\n⚠️ ERROR CHECKING (${errors.length}):\n${errors.map(e => `${e.table}: ${e.error}`).join('\n')}`);
  }
  
  if (missing.length === 0 && errors.length === 0) {
    console.log('\n✅ ALL TABLES EXIST!');
  }
}

verifyAll();
