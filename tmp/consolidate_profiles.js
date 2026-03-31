const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findAndSync() {
  // 1. Find all profiles for this email
  const { data: emps, error } = await supabase
    .from('employees')
    .select('id, email, role')
    .eq('email', 'manisreethaar@gmail.com');

  if (error) { console.error('Error fetching employees:', error); return; }
  console.log('Found employees:', emps);

  // 2. Find the one that matches auth.uid()
  const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers();
  const authUser = users.find(u => u.email === 'manisreethaar@gmail.com');
  
  if (!authUser) { console.error('Auth user not found'); return; }
  const activeId = authUser.id;
  const legacyId = emps.find(e => e.id !== activeId)?.id;

  if (!legacyId) {
    console.log('No legacy ID found. Check if email was renamed.');
    // Try finding by the renamed email pattern
    const { data: legacyEmps } = await supabase
      .from('employees')
      .select('id, email')
      .ilike('email', 'legacy_profile_%oxybio_old.com');
    
    if (legacyEmps && legacyEmps.length > 0) {
      console.log('Found legacy candidate:', legacyEmps[0]);
      // This is likely it.
      sync(legacyEmps[0].id, activeId);
    }
    return;
  }

  sync(legacyId, activeId);
}

async function sync(oldId, newId) {
  console.log(`Syncing data from ${oldId} to ${newId}...`);
  
  const tables = [
    { name: 'attendance_log', col: 'employee_id' },
    { name: 'tasks', col: 'assigned_to' },
    { name: 'tasks', col: 'created_by' },
    { name: 'formulations', col: 'approved_by' },
    { name: 'lab_logs', col: 'logged_by' },
    { name: 'stage_transitions', col: 'changed_by' },
    { name: 'deviations', col: 'reported_by' },
    { name: 'investigations', col: 'investigator_id' },
    { name: 'capa_actions', col: 'verified_by' },
    { name: 'inventory_usage', col: 'logged_by' },
    { name: 'calibration_logs', col: 'logged_by' },
    { name: 'sop_acknowledgements', col: 'employee_id' }
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table.name)
        .update({ [table.col]: newId })
        .eq(table.col, oldId);
      
      if (error) {
        console.warn(`Skipping ${table.name}.${table.col}: ${error.message}`);
      } else {
        console.log(`Updated ${count || 0} rows in ${table.name}`);
      }
    } catch (e) {
      console.error(`Failed ${table.name}:`, e);
    }
  }

  // Finally delete the old employee record
  console.log('Deleting legacy employee record...');
  const { error: delErr } = await supabase.from('employees').delete().eq('id', oldId);
  if (delErr) console.error('Delete failed:', delErr.message);
  else console.log('Successfully removed duplicate profile.');
}

findAndSync();
