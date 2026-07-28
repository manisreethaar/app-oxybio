require('dotenv').config({ path: '.env.local' });

async function run() {
  const headers = {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  
  const res = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/calibration_logs?select=log_type', { headers });
  const data = await res.json();
  const types = new Set(data.map(d => d.log_type));
  console.log(Array.from(types));
}
run().catch(console.error);
