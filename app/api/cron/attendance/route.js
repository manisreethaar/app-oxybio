import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// nodejs runtime required — edge runtime can't use Service Role Key (no Node crypto)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── IST helpers ───────────────────────────────────────────────
function toISTDateStr(utcDate) {
  // Convert UTC → IST (UTC+5:30) and return YYYY-MM-DD
  const ist = new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().split('T')[0];
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const nowUtc = new Date();

    // ── FIX 1: Use IST date, NOT UTC date ─────────────────────
    // Cron fires at 18:30 UTC = 00:00 IST.
    // At that moment toISOString() gives the UTC date (yesterday IST).
    // Attendance records are stored with the IST date — must match.
    const todayIst    = toISTDateStr(nowUtc);
    const yesterdayIst = toISTDateStr(new Date(nowUtc.getTime() - 24 * 60 * 60 * 1000));

    // 1. Find open shifts for today/yesterday IST
    const { data: openLogs, error: fetchError } = await supabaseAdmin
      .from('attendance_log')
      .select('id, employee_id, check_in_time')
      .is('check_out_time', null)
      .in('date', [todayIst, yesterdayIst]);

    if (fetchError) throw fetchError;

    // 2. Only close shifts older than 12 hours (genuine abandons)
    const twelveHoursAgo = new Date(nowUtc.getTime() - 12 * 60 * 60 * 1000);
    const shiftsToClose  = (openLogs || []).filter(
      log => new Date(log.check_in_time) < twelveHoursAgo
    );

    if (shiftsToClose.length === 0) {
      return NextResponse.json({ success: true, message: 'No abandoned shifts found.' });
    }

    // 3. Auto-close: set hours = 0, require mispunch
    const updates = shiftsToClose.map(log => ({
      id:               log.id,
      check_out_time:   nowUtc.toISOString(),
      total_hours:      0,
      mispunch_status:  'required',
      notes:            '[SYSTEM: AUTO-CLOSED AT MIDNIGHT — MISPUNCH REVIEW REQUIRED]',
    }));

    const { error: updateError } = await supabaseAdmin
      .from('attendance_log')
      .upsert(updates);

    if (updateError) throw updateError;

    // ── FIX 5: Notify each affected employee ──────────────────
    // Previously the employee was never told their shift was zeroed.
    const affectedEmployeeIds = [...new Set(shiftsToClose.map(l => l.employee_id))];

    const notifRows = affectedEmployeeIds.map(empId => ({
      employee_id: empId,
      title:       '⚠️ Your Shift Was Auto-Closed',
      message:     'You were still checked in at midnight. Your working hours have been set to 0. Please submit a Mispunch Request with the correct hours.',
      link_url:    '/mispunch',
      is_read:     false,
    }));

    await supabaseAdmin.from('notifications').insert(notifRows);

    return NextResponse.json({
      success: true,
      message: `Auto-closed ${shiftsToClose.length} abandoned shift(s) and notified ${affectedEmployeeIds.length} employee(s).`,
    });

  } catch (error) {
    console.error('[Attendance Cron] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
