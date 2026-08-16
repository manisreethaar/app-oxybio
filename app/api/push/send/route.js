export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getRequestUser } from '@/utils/supabase/request-user';
import { sendServerNotification } from '@/utils/serverNotify';

export async function POST(req) {
  try {
    // SECURITY: Cron calls use CRON_SECRET, user-triggered calls use session auth
    const authHeader = req.headers.get('authorization');
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron) {
      // Use zero-latency middleware header identity instead of auth.getUser() network call
      const user = getRequestUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json();
    const { assigned_to, title, body: msgBody, url, type = 'info' } = body;

    if (!assigned_to) {
      return NextResponse.json({ error: 'Missing assigned_to' }, { status: 400 });
    }

    // Unified notification sending:
    // 1. Logs to DB (making it show up in the in-app Bell menu)
    // 2. Safely triggers Web-Push OS notification if they are subscribed
    await sendServerNotification(
      assigned_to,
      title || 'New Activity — OxyOS',
      msgBody || 'Open OxyOS to view details.',
      url || '/notifications',
      type
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Push Send API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
