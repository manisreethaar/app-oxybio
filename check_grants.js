const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key] = val.trim().replace(/^\"|\"$/g, '');
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.rpc('exec_sql', { query: `
    SELECT grantee, privilege_type 
    FROM information_schema.role_table_grants 
    WHERE table_name = 'notifications' AND grantee = 'authenticated';
  `});
  console.log('GRANTS:', data, error);
}
check();
