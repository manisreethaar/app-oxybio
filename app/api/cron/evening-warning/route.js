import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendServerNotification } from '@/utils/serverNotify';

// nodejs runtime required — edge runtime can't use Service Role Key (no Node crypto)
// Also: web-push requires Node.js crypto, not available in edge
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── IST helper ────────────────────────────────────────────────
function toISTDateStr(utcDate) {
  const ist = new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().split('T')[0];
}

// sendServerNotification handles both DB insertions and push notifications

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── FIX 2: supabaseAdmin declared OUTSIDE try so it's accessible everywhere
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const nowUtc = new Date();

    // ── FIX 1: Use IST date for the query ─────────────────────
    // Cron fires at 15:30 UTC = 21:00 IST.
    // Attendance records are stored using IST dates — must match.
    const todayIst = toISTDateStr(nowUtc);

    // 1. Fetch open shifts for today (IST)
    const { data: openShifts, error: fetchError } = await supabaseAdmin
      .from('attendance_log')
      .select('id, employee_id, check_in_time')
      .eq('date', todayIst)
      .is('check_out_time', null);

    if (fetchError) throw fetchError;

    if (!openShifts || openShifts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All shifts are closed for today — no warnings needed.',
      });
    }

    const employeeIds = [...new Set(openShifts.map(s => s.employee_id))];

    // 2. Fetch employee names
    const { data: employees, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, full_name')
      .in('id', employeeIds);

    if (empError) throw empError;

    // 3. Insert in-app notifications and Send push
    const notifyPromises = employees.map(emp => sendServerNotification(
      emp.id,
      '🔴 You Are Still Checked In',
      'It is 9:00 PM and your shift is still open. Please check out now — at midnight your hours will be set to 0 and a Mispunch will be required.',
      '/attendance'
    ));

    await Promise.allSettled(notifyPromises);

    return NextResponse.json({
      success: true,
      message: `Sent 9 PM warnings to ${employees.length} employee(s).`,
    });

  } catch (error) {
    console.error('[Evening Warning Cron] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
