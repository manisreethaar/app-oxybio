export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { notifyAdmins } from '@/utils/serverNotify';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const selfReportSchema = z.object({
  logId: z.string().uuid('Invalid attendance log ID'),
  hours: z.number().min(0.5).max(16),
  reason: z.string().min(5, 'Reason is too short'),
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = selfReportSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { logId, hours, reason } = parsed.data;

    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee record not found' }, { status: 404 });

    // Verify log belongs to this user and is genuinely open
    const { data: log, error: logErr } = await supabase
      .from('attendance_log')
      .select('id, employee_id, date, check_out_time, mispunch_status')
      .eq('id', logId)
      .single();

    if (logErr || !log) return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 });
    if (log.employee_id !== emp.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (log.check_out_time) return NextResponse.json({ error: 'This shift already has a checkout time.' }, { status: 400 });
    if (log.mispunch_status) return NextResponse.json({ error: 'A mispunch already exists for this shift.' }, { status: 400 });

    // Atomically close the open shift and submit the mispunch request in one update.
    // Goes straight to 'pending' — no need for the 'required' intermediate state since
    // the user is providing hours and reason at the same time.
    const { error: updateError } = await supabase
      .from('attendance_log')
      .update({
        check_out_time: new Date().toISOString(),
        total_hours: 0,
        mispunch_status: 'pending',
        mispunch_requested_hours: hours,
        mispunch_reason: reason,
        notes: '[USER SELF-REPORTED: Forgot to check out. Awaiting admin review.]',
      })
      .eq('id', logId);

    if (updateError) throw updateError;

    await notifyAdmins(
      '📄 Mispunch — Self-Reported Missed Checkout',
      `${user.email} forgot to check out on ${new Date(log.date).toLocaleDateString()} and is requesting ${hours}h credit.`,
      '/mispunch'
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Self-Report Mispunch] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
