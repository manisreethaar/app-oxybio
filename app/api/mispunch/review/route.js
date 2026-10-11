export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { isMasterAdmin } from '@/lib/permissions';
import { sendServerNotification } from '@/utils/serverNotify';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const mispunchReviewSchema = z.object({
  logId: z.string().uuid('Invalid attendance log ID'),
  action: z.enum(['approve', 'reject']),
  remark: z.string().optional()
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const user = await getApiUserOrFallback(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = mispunchReviewSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { logId, action, remark } = parsed.data;

    if (action === 'reject' && (!remark || remark.trim().length < 5)) {
      return NextResponse.json({ error: 'A mandatory rejection remark (min 5 chars) is required.' }, { status: 400 });
    }

    const isMaster = isMasterAdmin(user.email);

    // 1. Verify user is executive or master admin
    const { data: reviewer } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    const isExec = ['admin', 'ceo', 'cto'].includes(reviewer?.role) || isMaster;
    if (!reviewer || !isExec) {
      return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
    }

    const supabaseAdmin = createAdminClient();

    // 2. Fetch the log (use admin client to bypass RLS for other employees)
    const { data: log, error: logErr } = await supabaseAdmin
      .from('attendance_log')
      .select('*')
      .eq('id', logId)
      .single();

    if (logErr || !log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });

    // CEO and Master Admin can approve their own; other admins cannot
    if (log.employee_id === reviewer.id && reviewer.role !== 'ceo' && !isMaster) {
      return NextResponse.json({ error: 'Forbidden: You cannot review your own mispunch request.' }, { status: 403 });
    }

    if (log.mispunch_status !== 'pending') {
      return NextResponse.json({ error: 'Mispunch request is not in pending state.' }, { status: 400 });
    }

    // 3. Update log based on action
    const updateData = {
      mispunch_status: action === 'approve' ? 'approved' : 'rejected',
      mispunch_remark: remark || null
    };

    if (action === 'approve') {
      const approvedHours = Number(log.mispunch_requested_hours) || 0;
      updateData.total_hours = approvedHours;
      // Set check_out_time to check_in_time + approvedHours so the shift duration matches exactly
      // and satisfies the DB trigger calc_total_hours()!
      if (log.check_in_time) {
        const inTime = new Date(log.check_in_time).getTime();
        updateData.check_out_time = new Date(inTime + approvedHours * 60 * 60 * 1000).toISOString();
      } else {
        const dayStart = new Date(log.date + 'T09:00:00Z').getTime();
        updateData.check_in_time = new Date(dayStart).toISOString();
        updateData.check_out_time = new Date(dayStart + approvedHours * 60 * 60 * 1000).toISOString();
      }
      updateData.notes = `[APPROVED: ${approvedHours}H CREDIT] - Reason: ${log.mispunch_reason || 'N/A'}`;
    } else {
      updateData.total_hours = 0;
      // On rejection, set check_out_time equal to check_in_time so the trigger calculates 0 hours
      if (log.check_in_time) {
        updateData.check_out_time = log.check_in_time;
      }
      updateData.notes = `[REJECTED: 0H CREDIT] - Remark: ${remark}`;
    }

    const { error: updateError } = await supabaseAdmin
      .from('attendance_log')
      .update(updateData)
      .eq('id', logId);

    if (updateError) throw updateError;

    // 4. Notify employee
    await sendServerNotification(
      log.employee_id,
      action === 'approve' ? '🟢 Mispunch Approved' : '🔴 Mispunch Rejected',
      action === 'approve' 
        ? `Your mispunch for ${new Date(log.date).toLocaleDateString()} was approved for ${log.mispunch_requested_hours}h.` 
        : `Your mispunch for ${new Date(log.date).toLocaleDateString()} was rejected. Reason: ${remark}`,
      '/attendance?tab=corrections'
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Mispunch Review Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
