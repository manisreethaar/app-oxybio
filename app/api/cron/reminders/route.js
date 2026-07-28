export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendServerNotification } from '@/utils/serverNotify';
import { differenceInDays, startOfDay, parseISO } from 'date-fns';

export async function GET(req) {
  try {
    // 1. Verify Vercel Cron Secret
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'No Service Key configured' }, { status: 500 });
    
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 2. Fetch Personal Reminders that are open/in-progress and due today (or overdue)
    const { data: reminders, error: remindersError } = await supabaseAdmin
      .from('tasks')
      .select('id, title, due_date, status, assigned_to')
      .eq('is_personal_reminder', true)
      .in('status', ['open', 'in-progress']);

    if (remindersError) throw remindersError;

    const today = startOfDay(new Date());
    
    // Group alerts by user
    const userAlerts = {}; // { [userId]: { messages: [] } }

    for (const task of reminders) {
      if (!task.due_date) continue;
      const dueDate = startOfDay(parseISO(task.due_date));
      const daysLeft = differenceInDays(dueDate, today);

      // Notify if due today or overdue — but cap at 30 days to avoid stale ghost alerts
      if (daysLeft <= 0 && daysLeft >= -30) {
        if (!userAlerts[task.assigned_to]) {
          userAlerts[task.assigned_to] = {
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
      return NextResponse.json({ success: true, message: 'No personal reminders due today.' });
    }

    let sentCount = 0;

    // 5. Dispatch server notifications (which handles both DB insert + Push)
    const notifyPromises = targetUsers.map(async (userId) => {
      const data = userAlerts[userId];
      const bodyText = data.messages.join('\n');
      await sendServerNotification(
        userId,
        `Personal Reminders (${data.messages.length})`,
        bodyText,
        '/tasks',
        'info'
      );
      sentCount++;
    });

    await Promise.allSettled(notifyPromises);

    return NextResponse.json({ 
      success: true, 
      users_notified: sentCount
    });

  } catch (error) {
    console.error("Reminders Cron Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
