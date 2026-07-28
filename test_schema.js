require('dotenv').config({ path: '.env.local' });

async function run() {
  const headers = {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  
  const res = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/', { headers });
  const schema = await res.json();
  
  const table = schema.definitions.calibration_logs;
  console.log(JSON.stringify(table.properties, null, 2));
}
run().catch(console.error);
