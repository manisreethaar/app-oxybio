const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '');
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: policies_media, error: e1 } = await supabase.rpc('execute_sql', {
    sql_query: "SELECT polname, polcmd, polroles, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'batch_stage_media_prep'::regclass;"
  });
  console.log('Media Prep Policies:', policies_media, e1);

  const { data: policies_qc, error: e2 } = await supabase.rpc('execute_sql', {
    sql_query: "SELECT polname, polcmd, polroles, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'batch_flask_qc_tests'::regclass;"
  });
  console.log('QC Tests Policies:', policies_qc, e2);
  
  const { data: locks, error: e3 } = await supabase.rpc('execute_sql', {
    sql_query: "SELECT relation::regclass, mode, granted, pid FROM pg_locks WHERE relation = 'batch_stage_media_prep'::regclass OR relation = 'batch_flasks'::regclass OR relation = 'batches'::regclass;"
  });
  console.log('Locks:', locks, e3);
}
check();
