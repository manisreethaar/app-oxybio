require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');

async function testDelete() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log("Fetching recipes...");
  const { data: formulations } = await supabase.from('formulations').select('id, name, version, status, base_version_id');
  console.log(formulations);

  // let's try to delete a Draft recipe
  const drafts = formulations.filter(f => f.status === 'Draft');
  if (drafts.length > 0) {
     console.log("Trying to delete draft:", drafts[0].name, drafts[0].version);
     const { error } = await supabase.from('formulations').delete().eq('id', drafts[0].id);
     console.log("Delete error:", error);
  }
}
testDelete();
