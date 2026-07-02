const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8')
  .split('\n')
  .reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      acc[parts[0]] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    }
    return acc;
  }, {});

const adminSupabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

adminSupabase
  .from('cell_bank_preparations')
  .select(\
        *,
        linked_formulation:formulations(id, code, name, version, category, status),
        cell_bank_strains(id, name, source_type, accession_number, isolation_source, taxonomy, strain_short_code, notes, formulation_id, characterization, linked_formulation:formulations(id, code, name, version, category, status)),
        parent:parent_id(id, prep_code, type, step_data, formulation_id),
        employees!cell_bank_preparations_created_by_fkey(full_name),
        qc_released_employee:employees!cell_bank_preparations_qc_released_by_fkey(full_name),
        cell_bank_vials(id, vial_code, storage_temp, freezer_id, rack, box, position, status, expires_at, used_in_batch_id, used_at, notes)
  \)
  .limit(1)
  .then(res => {
    console.log(JSON.stringify(res, null, 2));
  });
