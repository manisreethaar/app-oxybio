require('dotenv').config({ path: '.env.local' });
const { POST } = require('./app/api/equipment/maintenance/route.js');
const { NextRequest } = require('next/server');

async function run() {
  const req = new NextRequest('http://localhost:3000/api/equipment/maintenance', {
    method: 'POST',
    body: JSON.stringify({
      equipment_id: '25e17cb3-cafd-47ff-9eb8-4c2e82dbfde5',
      calibration_date: '2026-07-28',
      next_due_date: '',
      log_type: 'Cleaning',
      result: 'Cleaning test',
      status: 'Operational'
    })
  });
  
  const res = await POST(req);
  console.log(await res.json());
}
run().catch(console.error);
