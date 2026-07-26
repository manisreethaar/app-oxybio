import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  // ── FIX 4: supabaseAdmin declared OUTSIDE try so catch block can access it
  // Previously declared inside try{} → ReferenceError in catch on 410 errors
  // → expired subscriptions were never cleaned up
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let assignedTo = null;

  try {
    // SECURITY: Cron calls use CRON_SECRET, user-triggered calls use session auth
    const authHeader = req.headers.get('authorization');
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron) {
      const supabase = createServerClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json();
    assignedTo = body.assigned_to; // capture for catch block
    const { title, body: msgBody, url } = body;

    if (!assignedTo) {
      return NextResponse.json({ error: 'Missing assigned_to' }, { status: 400 });
    }

    const { data: employee, error: dbError } = await supabaseAdmin
      .from('employees')
      .select('push_subscription')
      .eq('id', assignedTo)
      .single();

    if (dbError || !employee?.push_subscription) {
      return NextResponse.json({
        success: false,
        reason: 'Employee not subscribed to push notifications',
      });
    }

    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });
    }

    webpush.setVapidDetails(
      process.env.VAPID_CONTACT_EMAIL || 'mailto:ceo@oxygenbioinnovations.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const sub = typeof employee.push_subscription === 'string'
      ? JSON.parse(employee.push_subscription)
      : employee.push_subscription;

    await webpush.sendNotification(sub, JSON.stringify({
      title: title || 'New Activity — OxyOS',
      body:  msgBody || 'Open OxyOS to view details.',
      url:   url || '/notifications',
    }));

    return NextResponse.json({ success: true });

  } catch (error) {
    // 410 / 404 = push subscription expired or invalid — clean it up
    if ((error.statusCode === 410 || error.statusCode === 404) && assignedTo) {
      // supabaseAdmin is now in scope (declared above try) — FIX 4
      await supabaseAdmin
        .from('employees')
        .update({ push_subscription: null })
        .eq('id', assignedTo);

      return NextResponse.json({
        success: false,
        reason: 'Subscription expired — removed. User must re-subscribe.',
      });
    }

    console.error('[Push Send] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
