import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  // Try to use rpc to execute a query, or if not available, we can just fetch a known view if it exists.
  // Actually, we can fetch the pg_constraint table if it's exposed? It's not exposed via PostgREST by default.
  // We can try to deliberately cause a constraint violation to read the error message!
  
  // Let's insert a dummy batch with an invalid stage to see what the constraint is called.
  const { data, error } = await supabase.from('batches').insert({
    batch_id: 'DEBUG-123',
    status: 'planned',
    current_stage: 'INVALID_STAGE_TEST'
  });

  return NextResponse.json({ error: error?.message, hint: error?.hint, details: error?.details, code: error?.code });
}
