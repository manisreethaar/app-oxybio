const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTrigger() {
  const { data, error } = await supabase.rpc('query_trigger_func', { func_name: 'check_fermentation_alarms' });
  
  // if rpc doesn't exist, we can try querying pg_proc directly using a raw query, or just use psql if we have it
  // Since we are using REST api via supabase-js, we can't run arbitrary SQL easily without a function.
  // Wait, let's try calling a function or just viewing the SQL if we have it in migrations.
}

checkTrigger();
