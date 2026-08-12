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

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[Checkout Reminder Cron] CRON_SECRET env var is not set. Set it in Vercel Project Settings → Environment Variables so Vercel can authenticate cron calls.');
    return NextResponse.json({ error: 'Server misconfiguration: CRON_SECRET not set' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const nowUtc = new Date();

    // Cron fires at 10:30 UTC = 16:00 IST.
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
        message: 'No open shifts found for today — no reminders needed.',
      });
    }

    const employeeIds = [...new Set(openShifts.map(s => s.employee_id))];

    // 2. Fetch employee names
    const { data: employees, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, full_name')
      .in('id', employeeIds);

    if (empError) throw empError;

    // 3. Insert in-app notifications and send push
    const notifyPromises = employees.map(emp => sendServerNotification(
      emp.id,
      '⏰ Checkout Reminder',
      'It is 4:00 PM. Please do not forget to checkout when you are done for the day.',
      '/attendance'
    ));

    await Promise.allSettled(notifyPromises);

    return NextResponse.json({
      success: true,
      message: `Sent checkout reminder to ${employees.length} employee(s).`,
      reminders_sent: employees.length,
    });

  } catch (error) {
    console.error('[Checkout Reminder Cron] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
