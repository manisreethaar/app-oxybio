require('dotenv').config({ path: '.env.local' });

async function run() {
  const headers = {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json'
  };
  
  const equipRes = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/equipment?select=id&limit=1', { headers });
  const equipData = await equipRes.json();
  const eqId = equipData[0].id;
  
  const empRes = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/employees?select=id&limit=1', { headers });
  const empData = await empRes.json();
  const empId = empData[0].id;
  
  const insertRes = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/calibration_logs', {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify({
      equipment_id: eqId,
      calibration_date: '2026-07-28',
      log_type: 'Maintenance',
      result: 'Test',
      logged_by: empId
    })
  });
  
  console.log(await insertRes.json());
}
run().catch(console.error);
