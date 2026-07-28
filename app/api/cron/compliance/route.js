export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyAdmins } from '@/utils/serverNotify';
import { differenceInDays, startOfDay, parseISO } from 'date-fns';

export async function GET(req) {
  try {
    // 1. Verify Vercel Cron Secret to prevent unauthorized triggers
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
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

    // 4. Send notifications via centralized utility
    const bodyText = alertsToSend.join('\n');
    await notifyAdmins(
      `Compliance Alerts (${alertsToSend.length} items)`,
      bodyText,
      '/compliance',
      'alert'
    );

    return NextResponse.json({ 
      success: true, 
      alerts_generated: alertsToSend.length
    });

  } catch (error) {
    console.error("Compliance Cron Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

