export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { notifyAdmins } from '@/utils/serverNotify';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const mispunchRequestSchema = z.object({
  logId: z.string().uuid('Invalid attendance log ID'),
  hours: z.number().min(0.5).max(24),
  reason: z.string().min(5, 'Reason is too short')
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const user = await getApiUserOrFallback(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = mispunchRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { logId, hours, reason } = parsed.data;
    const supabaseAdmin = createAdminClient();

    // 1. Verify log belongs to the user and is in 'required' status
    const { data: log, error: logErr } = await supabaseAdmin
      .from('attendance_log')
      .select('id, employee_id, mispunch_status')
      .eq('id', logId)
      .single();

    if (logErr || !log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });

    const { data: emp } = await supabaseAdmin.from('employees').select('id, full_name').eq('email', user.email).single();
    if (!emp || log.employee_id !== emp.id) {
      return NextResponse.json({ error: 'Forbidden: You do not own this attendance log.' }, { status: 403 });
    }

    if (log.mispunch_status !== 'required') {
      return NextResponse.json({ error: 'Mispunch request already submitted or not required for this log.' }, { status: 400 });
    }

    // 2. Update log with request details
    const { error: updateError } = await supabaseAdmin
      .from('attendance_log')
      .update({
        mispunch_status: 'pending',
        mispunch_requested_hours: hours,
        mispunch_reason: reason
      })
      .eq('id', logId);

    if (updateError) throw updateError;

    // 3. Notify Admins
    await notifyAdmins(
      '📄 New Mispunch Request',
      `${emp.full_name || user.email} has applied for ${hours}h reconciliation.`,
      '/attendance?tab=corrections'
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Mispunch Request Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
