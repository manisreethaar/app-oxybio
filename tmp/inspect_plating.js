const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
supabase.from('lab_notebook_entries').select('stage_snapshots').neq('stage_snapshots', null).then(r => {
  console.log(r);
});
