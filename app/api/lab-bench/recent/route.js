import { createClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { NextResponse } from 'next/server';
import { getLabBenchRecent } from '@/app/lab-bench/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const user = await getApiUserOrFallback(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const result = await getLabBenchRecent(supabase, emp.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
