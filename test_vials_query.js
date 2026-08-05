const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

supabase.from('cell_bank_vials').select(`
        id, vial_code, storage_temp, freezer_id, rack, box, position, status,
        used_in_batch_id, used_at, notes, created_at,
        batches!used_in_batch_id(id, batch_id),
        cell_bank_preparations!preparation_id(
          id, prep_code, type, passage_number,
          cell_bank_strains(id, name, accession_number, strain_short_code)
        )
      `).then(({data, error}) => {
  if (error) console.error('ERROR:', error);
  else console.log('Success, data length:', data.length);
});
