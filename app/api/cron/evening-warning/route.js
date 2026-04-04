import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// nodejs runtime required — edge runtime can't use Service Role Key (no Node crypto)
// Also: web-push requires Node.js crypto, not available in edge
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── IST helper ────────────────────────────────────────────────
function toISTDateStr(utcDate) {
  const ist = new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().split('T')[0];
}

// ── Direct push sender — avoids self-HTTP fetch ───────────────
// Previously this cron called /api/push/send via HTTP (self-fetch on Vercel
// edge = silent failure). Now we send directly from the same process.
async function sendPushToEmployee(supabaseAdmin, employeeId, title, body, url) {
  try {
    const { data: emp } = await supabaseAdmin
      .from('employees')
      .select('push_subscription')
      .eq('id', employeeId)
      .single();

    if (!emp?.push_subscription) return; // not subscribed — skip

    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

    webpush.setVapidDetails(
      process.env.VAPID_CONTACT_EMAIL || 'mailto:ceo@oxygenbioinnovations.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const sub = typeof emp.push_subscription === 'string'
      ? JSON.parse(emp.push_subscription)
      : emp.push_subscription;

    await webpush.sendNotification(sub, JSON.stringify({ title, body, url }));
  } catch (err) {
    // 410 = subscription expired — clean it up
    if (err.statusCode === 410 || err.statusCode === 404) {
      await supabaseAdmin
        .from('employees')
        .update({ push_subscription: null })
        .eq('id', employeeId);
    }
    // Don't throw — one employee's push failure shouldn't abort the whole cron
  }
}

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

    // 3. Insert in-app notifications
    const notifRows = employees.map(emp => ({
      employee_id: emp.id,
      title:       '🔴 You Are Still Checked In',
      message:     'It is 9:00 PM and your shift is still open. Please check out now — at midnight your hours will be set to 0 and a Mispunch will be required.',
      link:        '/attendance',
      is_read:     false,
    }));

    await supabaseAdmin.from('notifications').insert(notifRows);

    // 4. ── FIX 3: Send push directly — no self-HTTP fetch ─────
    // Previously called /api/push/send via fetch() from edge runtime.
    // Self-fetch on Vercel = silent failure. Now we call directly.
    await Promise.allSettled(
      employees.map(emp =>
        sendPushToEmployee(
          supabaseAdmin,
          emp.id,
          '🔴 Still Checked In? Check Out Now',
          'It is 9 PM. At midnight your hours will be zeroed and a Mispunch will be required. Check out now on OxyOS.',
          '/attendance'
        )
      )
    );

    return NextResponse.json({
      success: true,
      message: `Sent 9 PM warnings to ${employees.length} employee(s).`,
    });

  } catch (error) {
    console.error('[Evening Warning Cron] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
