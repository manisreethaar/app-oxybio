require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const q1 = supabase
  .from('batches')
  .select(`
    id, batch_id, experiment_type, sku_target, status, current_stage,
    planned_volume_ml, num_flasks, planned_start_date, start_time, created_at, assigned_team, has_alarm, archived_at,
    created_by, creator:employees!batches_created_by_fkey(id, full_name, initials),
    formulations(name, code, version),
    batch_flasks(id, flask_label, status, current_stage)
  `)
  .is('archived_at', null)
  .not('status', 'in', '("released","rejected")')
  .order('created_at', { ascending: false });

const q3 = supabase
  .from('batches')
  .select(`id`)
  .not('archived_at', 'is', null)
  .order('archived_at', { ascending: false });

Promise.all([q1, q3]).then(([r1, r3]) => {
  console.log('Q1 Error:', r1.error, 'Q1 Data Length:', r1.data ? r1.data.length : null);
  console.log('Q3 Error:', r3.error, 'Q3 Data Length:', r3.data ? r3.data.length : null);
});
