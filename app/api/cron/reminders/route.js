import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { differenceInDays, startOfDay, parseISO } from 'date-fns';

export async function GET(req) {
  try {
    // 1. Verify Vercel Cron Secret
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
         return new Response('Unauthorized', { status: 401 });
      }
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'No Service Key configured' }, { status: 500 });
    
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 2. Fetch Personal Reminders that are open/in-progress and due today (or overdue)
    const { data: reminders, error: remindersError } = await supabaseAdmin
      .from('tasks')
      .select('id, title, due_date, status, assigned_to, employees!tasks_assigned_to_fkey(push_subscription)')
      .eq('is_personal_reminder', true)
      .in('status', ['open', 'in-progress']);

    if (remindersError) throw remindersError;

    const today = startOfDay(new Date());
    
    // Group alerts by user
    const userAlerts = {}; // { [userId]: { sub: {...}, messages: [] } }

    for (const task of reminders) {
      if (!task.due_date) continue;
      const dueDate = startOfDay(parseISO(task.due_date));
      const daysLeft = differenceInDays(dueDate, today);

      // Notify if due today or overdue — but cap at 30 days to avoid stale ghost alerts
      if (daysLeft <= 0 && daysLeft >= -30) {
        // Supabase FK join can return an array or object depending on cardinality — normalize
        const emp = Array.isArray(task.employees) ? task.employees[0] : task.employees;
        if (!emp || !emp.push_subscription) continue;

        if (!userAlerts[task.assigned_to]) {
          userAlerts[task.assigned_to] = {
            sub: typeof emp.push_subscription === 'string' ? JSON.parse(emp.push_subscription) : emp.push_subscription,
            messages: []
          };
        }

        if (daysLeft === 0) {
          userAlerts[task.assigned_to].messages.push(`📌 DUE TODAY: ${task.title}`);
        } else {
          userAlerts[task.assigned_to].messages.push(`🚨 OVERDUE: ${task.title} (${Math.abs(daysLeft)} days)`);
        }
      }
    }

    const targetUsers = Object.keys(userAlerts);
    if (targetUsers.length === 0) {
      return NextResponse.json({ success: true, message: 'No personal reminders due today for subscribed users.' });
    }

    // Configure Web Push
    webpush.setVapidDetails(
      'mailto:founder@oxybio.in',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    let sentCount = 0;
    let failCount = 0;

    // 5. Dispatch actual push notifications
    for (const userId of targetUsers) {
      const data = userAlerts[userId];
      try {
        const bodyText = data.messages.join('\n');
        const payload = JSON.stringify({
          title: `Personal Reminders (${data.messages.length})`,
          body: bodyText,
          url: '/tasks'
        });

        await webpush.sendNotification(data.sub, payload);
        sentCount++;
      } catch (err) {
        console.error(`Failed to send to user ${userId}:`, err.message);
        failCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      users_notified: sentCount,
      notifications_failed: failCount
    });

  } catch (error) {
    console.error("Reminders Cron Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
