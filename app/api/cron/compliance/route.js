import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { differenceInDays, startOfDay, parseISO } from 'date-fns';

export async function GET(req) {
  try {
    // 1. Verify Vercel Cron Secret to prevent unauthorized triggers
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn("Unauthorized Cron request:", authHeader);
      // Fallback: If not enforced tightly during dev, we can still run it or return 401.
      // For Next.js App Router, returning 401 immediately is safest.
      // But let's allow bypassing if CRON_SECRET is not set in env (for local testing).
      if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
         return new Response('Unauthorized', { status: 401 });
      }
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'No Service Key configured' }, { status: 500 });
    
    // Create Supabase Admin block
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 2. Fetch compliance items that are active and due within the next 35 days (or overdue)
    // This prevents pulling 10,000 future records and hitting Vercel's 10s lambda timeout limit.
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 35);

    const { data: items, error: itemsError } = await supabaseAdmin
      .from('compliance_items')
      .select('id, title, due_date, status')
      .neq('status', 'done')
      .lte('due_date', maxDate.toISOString());

    if (itemsError) throw itemsError;

    const today = startOfDay(new Date());
    const alertsToSend = [];

    // 3. Process which items need an alert today
    for (const item of items) {
      if (item.status === 'done') continue;
      if (!item.due_date) continue;

      const dueDate = startOfDay(parseISO(item.due_date));
      const daysLeft = differenceInDays(dueDate, today);

      if (daysLeft === 30) {
        alertsToSend.push(`Upcoming: "${item.title}" is due in 30 days.`);
      } else if (daysLeft === 7) {
        alertsToSend.push(`Action Required: "${item.title}" is due next week!`);
      } else if (daysLeft === 1) {
        alertsToSend.push(`URGENT: "${item.title}" is due TOMORROW!`);
      } else if (daysLeft === 0) {
        alertsToSend.push(`CRITICAL: "${item.title}" is DUE TODAY!`);
      } else if (daysLeft < 0 && daysLeft >= -7) {
        // Nag every day for the first 7 days it is overdue
        alertsToSend.push(`OVERDUE: "${item.title}" is ${Math.abs(daysLeft)} days overdue!`);
      }
    }

    if (alertsToSend.length === 0) {
      return NextResponse.json({ success: true, message: 'No alerts needed today.' });
    }

    // 4. Fetch all Admins who have push notifications enabled
    const { data: admins, error: adminError } = await supabaseAdmin
      .from('employees')
      .select('id, push_subscription')
      .eq('role', 'admin')
      .not('push_subscription', 'is', null);

    if (adminError) throw adminError;
    if (!admins || admins.length === 0) {
      return NextResponse.json({ success: true, message: 'Alerts generated but no admins are subscribed to push.' });
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
    for (const admin of admins) {
      try {
        let sub = admin.push_subscription;
        if (typeof sub === 'string') {
           sub = JSON.parse(sub);
        }

        // We could send one combined notification or multiple. Let's combine them so we don't spam the phone.
        const bodyText = alertsToSend.join('\n');
        const payload = JSON.stringify({
          title: `Compliance Alerts (${alertsToSend.length} items)`,
          body: bodyText,
          url: '/compliance'
        });

        await webpush.sendNotification(sub, payload);
        sentCount++;
      } catch (err) {
        console.error(`Failed to send to admin ${admin.id}:`, err.message);
        failCount++;
        // If statusCode is 410, it means the subscription expired/unsubscribed. 
        // We could auto-clean it from DB here, but we will leave it for now.
      }
    }

    return NextResponse.json({ 
      success: true, 
      alerts_generated: alertsToSend.length,
      notifications_sent: sentCount,
      notifications_failed: failCount
    });

  } catch (error) {
    console.error("Compliance Cron Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
