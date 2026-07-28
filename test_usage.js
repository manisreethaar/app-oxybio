require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('calibration_logs')
    .insert({
      equipment_id: '25e17cb3-cafd-47ff-9eb8-4c2e82dbfde5',
      calibration_date: '2026-07-28',
      log_type: 'Usage',
      result: 'Usage test',
      logged_by: 'b495c4c9-cd83-4558-9886-5ba34902a1e0'
    }).select();
  console.log("Insert Usage:", error || data);
}
test().catch(console.error);
