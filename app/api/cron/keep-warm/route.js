import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

// GET /api/cron/keep-warm
// Runs every 5 minutes via Vercel cron to prevent Supabase cold starts.
// A cold Supabase project takes 5–30s to wake. This endpoint keeps it warm
// with a trivial query so the first real user request is always fast.
export async function GET(request) {
  // Verify this is a legitimate Vercel cron call
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient();
    // Just enough to wake the DB — no real data transferred
    const { error } = await supabase.rpc('pg_sleep', { seconds: 0 }).maybeSingle()
      .catch(() => supabase.from('employees').select('id').limit(1).maybeSingle());

    return NextResponse.json({
      ok: true,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
