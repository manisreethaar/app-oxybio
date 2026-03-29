import { createClient } from '@/utils/supabase/server';
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

    // 2. Fetch the log
    const { data: log, error: logErr } = await supabase
      .from('attendance_log')
      .select('*')
      .eq('id', logId)
      .single();

    if (logErr || !log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });

    if (log.mispunch_status !== 'pending') {
      return NextResponse.json({ error: 'Mispunch request is not in pending state.' }, { status: 400 });
    }

    // 3. Update log based on action
    const updateData = {
        mispunch_status: action === 'approve' ? 'approved' : 'rejected',
        mispunch_remark: remark || null
    };

    if (action === 'approve') {
        updateData.total_hours = log.mispunch_requested_hours;
        // Also add a note
        updateData.notes = `[EXECUTIVE APPROVED: ${log.mispunch_requested_hours}H CREDIT] - Reason: ${log.mispunch_reason}`;
    } else {
        updateData.notes = `[EXECUTIVE REJECTED: 0H CREDIT] - Remark: ${remark}`;
    }

    const { error: updateError } = await supabase
      .from('attendance_log')
      .update(updateData)
      .eq('id', logId);

    if (updateError) throw updateError;

    // 4. Notify employee
    await supabase.from('notifications').insert({
        employee_id: log.employee_id,
        title: action === 'approve' ? '🟢 Mispunch Approved' : '🔴 Mispunch Rejected',
        message: action === 'approve' 
            ? `Your mispunch for ${new Date(log.date).toLocaleDateString()} was approved for ${log.mispunch_requested_hours}h.` 
            : `Your mispunch for ${new Date(log.date).toLocaleDateString()} was rejected. Reason: ${remark}`,
        url: '/mispunch',
        is_read: false
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Mispunch Review Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
