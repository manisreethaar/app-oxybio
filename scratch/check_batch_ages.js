const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkBatches() {
  const { data: batches, error: bError } = await supabase
    .from('batches')
    .select('id, batch_id, start_time, status, current_stage');
  
  if (bError) { console.error('Batches error:', bError); return; }

  const { data: endpoints, error: epError } = await supabase
    .from('batch_flask_endpoints')
    .select('batch_id, total_hours, end_time');
    
  if (epError) { console.error('Endpoints error:', epError); return; }

  let epMap = {};
  endpoints.forEach(ep => {
    const prev = epMap[ep.batch_id];
    const prevHrs = prev?.total_hours ?? null;
    const curHrs = ep.total_hours ?? null;
    if (curHrs != null && (prevHrs == null || curHrs > prevHrs)) {
      epMap[ep.batch_id] = { total_hours: curHrs, end_time: ep.end_time };
    } else if (!prev) {
      epMap[ep.batch_id] = { total_hours: null, end_time: ep.end_time };
    }
  });

  const now = new Date();
  
  batches.sort((a, b) => (b.batch_id || '').localeCompare(a.batch_id || '', undefined, { numeric: true }));

  console.log('Batch ID | Status | Stage | Start Time | Harvest End Time | Calculated Age | Ferm Hrs');
  console.log('-----------------------------------------------------------------------------------------');
  
  for (const b of batches) {
    const ep = epMap[b.id] || {};
    const startTime = b.start_time ? new Date(b.start_time) : null;
    const harvestEnd = ep.end_time ? new Date(ep.end_time) : null;
    
    let age = 'N/A';
    if (startTime) {
      if (harvestEnd) {
        age = ((harvestEnd - startTime) / 3600000).toFixed(1) + 'h (Fixed)';
      } else {
        age = ((now - startTime) / 3600000).toFixed(1) + 'h (Live)';
      }
    }
    
    console.log(`${b.batch_id?.padEnd(14)} | ${b.status?.padEnd(8)} | ${b.current_stage?.padEnd(16)} | ${startTime ? startTime.toISOString().slice(0, 10) : 'None'} | ${harvestEnd ? harvestEnd.toISOString().slice(0, 10) : 'None'.padEnd(10)} | ${age.padEnd(15)} | ${ep.total_hours ? ep.total_hours.toFixed(1) : 'None'}`);
  }
}

checkBatches();
