import { createClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { NextResponse } from 'next/server';
import { getLabBenchQueue } from '@/app/lab-bench/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const user = await getApiUserOrFallback(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const result = await getLabBenchQueue(supabase);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Lab Bench queue API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
