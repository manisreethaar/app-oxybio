import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = mispunchReviewSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { logId, action, remark } = parsed.data;

    if (action === 'reject' && (!remark || remark.trim().length < 5)) {
        return NextResponse.json({ error: 'A mandatory rejection remark (min 5 chars) is required.' }, { status: 400 });
    }

    // 1. Verify user is executive
    const { data: reviewer } = await supabase.from('employees').select('role').eq('email', user.email).single();
    if (!reviewer || !['admin', 'ceo', 'cto'].includes(reviewer.role)) {
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

    if (log.mispunch_status !== 'pending') {
      return NextResponse.json({ error: 'Mispunch request is not in pending state.' }, { status: 400 });
    }

    // 3. Update log based on action
    const now = new Date().toISOString();
    const updateData = {
        mispunch_status: action === 'approve' ? 'approved' : 'rejected',
        mispunch_remark: remark || null
    };

    if (action === 'approve') {
        const approvedHours = log.mispunch_requested_hours || 0;
        updateData.total_hours = approvedHours;
        // Set check_out_time to a synthetic value so the shift shows as closed
        if (!log.check_out_time && log.check_in_time) {
          const inTime = new Date(log.check_in_time).getTime();
          updateData.check_out_time = new Date(inTime + approvedHours * 60 * 60 * 1000).toISOString();
        }
        updateData.notes = `[APPROVED: ${approvedHours}H CREDIT] - Reason: ${log.mispunch_reason}`;
    } else {
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
        '/mispunch'
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Mispunch Review Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
