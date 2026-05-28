import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendServerNotification, notifyAdmins } from '@/utils/serverNotify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createAdminClient();
  const now = Date.now();

  // Fetch pending plates that are at least 24 hours old
  const cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await supabaseAdmin
    .from('sample_incubation_records')
    .select('id, sample_name, logged_by, start_time, duration_hours, source_label, source_type')
    .eq('sterility_status', 'Pending')
    .lt('start_time', cutoff);

  if (error) {
    console.error('[incubation-overdue] query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Only notify for records that crossed the overdue threshold in the last 24 hours
  // (so each record triggers exactly one notification per overdue event)
  const overdue = (pending || []).filter(r => {
    const startMs = new Date(r.start_time).getTime();
    const overdueMs = startMs + (r.duration_hours ?? 48) * 3_600_000;
    return overdueMs < now && overdueMs > now - 24 * 3_600_000;
  });

  if (overdue.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  // Group by logged_by employee
  const byEmployee = new Map();
  const unassigned = [];
  for (const r of overdue) {
    if (r.logged_by) {
      if (!byEmployee.has(r.logged_by)) byEmployee.set(r.logged_by, []);
      byEmployee.get(r.logged_by).push(r);
    } else {
      unassigned.push(r);
    }
  }

  const jobs = [];

  for (const [empId, records] of byEmployee) {
    const names = records.map(r => r.sample_name || r.source_label || 'Unknown plate').slice(0, 3);
    const extra = records.length > 3 ? ` +${records.length - 3} more` : '';
    jobs.push(
      sendServerNotification(
        empId,
        `🔬 Incubation Overdue — ${records.length} plate${records.length > 1 ? 's' : ''}`,
        `Results still pending: ${names.join(', ')}${extra}. Please update sterility status.`,
        '/research/incubation',
        'alert'
      )
    );
  }

  if (unassigned.length > 0) {
    jobs.push(
      notifyAdmins(
        `🔬 Incubation Overdue — ${unassigned.length} unassigned plate${unassigned.length > 1 ? 's' : ''}`,
        `${unassigned.length} plate(s) are overdue with no assigned owner. Please review incubation hub.`,
        '/research/incubation',
        'alert'
      )
    );
  }

  await Promise.allSettled(jobs);

  return NextResponse.json({
    notified: overdue.length,
    employees: byEmployee.size,
    unassigned: unassigned.length,
  });
}
