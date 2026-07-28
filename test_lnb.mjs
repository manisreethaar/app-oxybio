import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function check() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
      .from('lab_notebook_entries')
      .select(`
        id,
        title,
        status,
        batch_stage,
        created_at,
        created_by,
        batches (
          id,
          batch_id,
          variant,
          status
        ),
        cell_bank_preparations (
          id,
          prep_code,
          type,
          status
        ),
        flask:batch_flasks!lab_notebook_entries_flask_id_fkey (
          flask_label
        ),
        author:employees!lab_notebook_entries_created_by_fkey (
          id,
          full_name,
          initials,
          role
        ),
        countersigner:employees!lab_notebook_entries_countersigned_by_fkey (
          full_name,
          role
        )
      `)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(5);
  
  console.log('Error:', error);
  console.log('Data length:', data?.length);
}
check();
