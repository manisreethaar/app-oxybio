require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const query = `
    CREATE TABLE IF NOT EXISTS public.batch_qc_holds (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE,
      flask_id UUID REFERENCES public.batch_flasks(id) ON DELETE CASCADE,
      hold_reason TEXT,
      released_by UUID REFERENCES public.employee_profiles(id),
      released_at TIMESTAMPTZ,
      status TEXT DEFAULT 'Pending',
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `;
  const { data, error } = await supabase.rpc('exec_sql', { sql: query });
  console.log(error ? error : 'QC hold table created');
}
run();
