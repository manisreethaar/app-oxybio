import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This cron runs every 15 minutes and pushes proactive alerts into the
// CEO/Admin's notifications table. The bell icon picks them up in real-time.

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const now = new Date();
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    const notifications = [];

    // 1. Check for recent pH deviations (last 15 minutes)
    const { data: deviations } = await supabase
      .from('ph_readings')
      .select('id, ph_value, created_at, batches(batch_id)')
      .eq('is_deviation', true)
      .gte('created_at', fifteenMinAgo);

    (deviations || []).forEach(d => {
      notifications.push({
        title: '⚠️ pH Deviation Detected',
        message: `pH ${d.ph_value} recorded on batch ${d.batches?.batch_id || 'unknown'} — outside safe range (4.2–4.5)`,
        type: 'alert',
        link: '/batches',
      });
    });

    // 2. Check for compliance items due within 3 days
    const { data: compliance } = await supabase
      .from('compliance_items')
      .select('id, title, category, due_date, status')
      .or(`status.eq.overdue,due_date.lte.${threeDaysOut}`)
      .neq('status', 'done');

    (compliance || []).forEach(c => {
      const isOverdue = c.status === 'overdue';
      notifications.push({
        title: isOverdue ? `🔴 Overdue: ${c.title}` : `🟡 Due Soon: ${c.title}`,
        message: isOverdue
          ? `${c.category} compliance item was due ${c.due_date}. Take action immediately.`
          : `${c.category} compliance item due ${c.due_date}.`,
        type: isOverdue ? 'alert' : 'warning',
        link: '/compliance',
      });
    });

    // 3. Check for employees still checked in after 7 PM IST
    const istHour = (now.getUTCHours() + 5) % 24 + (now.getUTCMinutes() + 30 >= 60 ? 1 : 0);
    if (istHour >= 19) {
      const { data: openShifts } = await supabase
        .from('attendance_log')
        .select('id, employee_id, employees(full_name)')
        .eq('date', today)
        .is('check_out_time', null);

      (openShifts || []).forEach(s => {
        notifications.push({
          title: '🔴 Late Check-Out',
          message: `${s.employees?.full_name || 'An employee'} is still checked in past 7 PM.`,
          type: 'warning',
          link: '/attendance',
        });
      });
    }

    if (notifications.length === 0) {
      return NextResponse.json({ success: true, message: 'No alerts to push.' });
    }

    // Find all admin/CEO employees to notify
    const { data: admins } = await supabase
      .from('employees')
      .select('id')
      .in('role', ['admin', 'ceo'])
      .eq('is_active', true);

    if (!admins || admins.length === 0) {
      return NextResponse.json({ success: true, message: 'No admins found to notify.' });
    }

    // Insert notifications for each admin
    const rows = [];
    admins.forEach(admin => {
      notifications.forEach(n => {
        rows.push({ employee_id: admin.id, ...n });
      });
    });

    await supabase.from('notifications').insert(rows);

    return NextResponse.json({
      success: true,
      message: `Pushed ${notifications.length} alert(s) to ${admins.length} admin(s).`,
    });

  } catch (error) {
    console.error('[Proactive Alerts Cron] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
