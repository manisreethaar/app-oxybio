import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get current date in IST (UTC+5:30)
    const nowUtc = new Date();
    // 09:30 AM IST = 4:00 AM UTC. Cron runs at 4:00 UTC.
    const nowIst = new Date(nowUtc.getTime() + (5.5 * 60 * 60 * 1000));
    const todayStr = nowIst.toISOString().split('T')[0];

    // 1. Fetch all active employees with push subscriptions
    const { data: employees, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, full_name, role, push_subscription')
      .eq('is_active', true);
    
    if (empError) throw empError;

    // 2. Fetch today's attendance logs
    const { data: attendance, error: attError } = await supabaseAdmin
      .from('attendance_log')
      .select('employee_id')
      .eq('date', todayStr);

    if (attError) throw attError;
    const checkedInIds = new Set(attendance.map(a => a.employee_id));

    // 3. Fetch approved leaves that overlap with today
    const { data: leaves, error: leaveError } = await supabaseAdmin
      .from('leave_applications')
      .select('employee_id')
      .eq('status', 'approved')
      .lte('start_date', todayStr)
      .gte('end_date', todayStr);

    if (leaveError) throw leaveError;
    const onLeaveIds = new Set(leaves.map(l => l.employee_id));

    // 4. Determine missing check-ins
    const missingEmployees = employees.filter(emp => !checkedInIds.has(emp.id) && !onLeaveIds.has(emp.id));

    if (missingEmployees.length === 0) {
      return NextResponse.json({ success: true, message: 'Everyone is accounted for (checked-in or on leave).' });
    }

    // 5. Create in-app notifications
    const notifications = missingEmployees.map(emp => ({
      employee_id: emp.id,
      title: '⏰ Attendance Reminder',
      message: 'It is past 09:30 AM and you have not checked in yet. Please log your attendance.',
      link: '/attendance',
      is_read: false
    }));

    const { error: notifError } = await supabaseAdmin
      .from('notifications')
      .insert(notifications);

    if (notifError) throw notifError;

    // 6. Dispatch Push Notifications Directly
    if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        process.env.VAPID_CONTACT_EMAIL || 'mailto:ceo@oxygenbioinnovations.com',
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );

      let sentCount = 0;
      let failCount = 0;

      for (const emp of missingEmployees) {
        if (!emp.push_subscription) continue;

        try {
          const sub = typeof emp.push_subscription === 'string'
            ? JSON.parse(emp.push_subscription)
            : emp.push_subscription;

          await webpush.sendNotification(sub, JSON.stringify({
            title: '⏰ Missing Check-In',
            body: 'It is past 09:30 AM. Please check in now via OxyOS.',
            url: '/attendance'
          }));
          sentCount++;
        } catch (err) {
          console.error(`[Morning Check] Failed to send push to user ${emp.id}:`, err.message);
          
          // Cleanup expired subscriptions (404/410)
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabaseAdmin
              .from('employees')
              .update({ push_subscription: null })
              .eq('id', emp.id);
          }
          failCount++;
        }
      }
      console.log(`[Morning Check] Push notifications sent: ${sentCount}, failed: ${failCount}`);
    } else {
      console.warn('[Morning Check] VAPID keys not configured, skipping push notifications.');
    }

    return NextResponse.json({ 
      success: true, 
      message: `Sent warnings to ${missingEmployees.length} missing employees.` 
    });

  } catch (error) {
    console.error('Morning Check Cron Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

