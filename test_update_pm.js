require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function testUpdate() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('equipment')
    .update({ next_pm_date: '2026-08-01' })
    .eq('id', '25e17cb3-cafd-47ff-9eb8-4c2e82dbfde5')
    .select();
    
  console.log("Update Next PM Date:", error || data);
}
testUpdate().catch(console.error);
