import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    // SECURITY: Ensure request is from an authenticated session
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized push trigger' }, { status: 401 });
    }

    const { assigned_to, title, body, url } = await req.json();
    if (!assigned_to) return NextResponse.json({ error: 'Missing assignee ID' }, { status: 400 });

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'No Service Key configured' }, { status: 500 });
    
    // Admin client to bypass RLS and securely query push subscriptions
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: employee, error: dbError } = await supabaseAdmin
      .from('employees')
      .select('push_subscription')
      .eq('id', assigned_to)
      .single();

    if (dbError || !employee || !employee.push_subscription) {
      // Not an error — user simply hasn't opted into push notifications
      return NextResponse.json({ success: false, reason: 'Device not opted in to push notifications' });
    }

    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });
    }

    webpush.setVapidDetails(
      process.env.VAPID_CONTACT_EMAIL || 'mailto:coe@oxygenbioinnovations.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const stringSub = typeof employee.push_subscription === 'string'
      ? JSON.parse(employee.push_subscription)
      : employee.push_subscription;

    await webpush.sendNotification(stringSub, JSON.stringify({
      title: title || 'New Activity — OxyOS',
      body: body || 'Open OxyOS to view details.',
      url: url || '/notifications'
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error.statusCode === 410 || error.statusCode === 404) {
      // Subscription expired or gone. Delete it from the DB so they are prompted to resubscribe.
      await supabaseAdmin.from('employees').update({ push_subscription: null }).eq('id', assigned_to);
      return NextResponse.json({ success: false, reason: 'Push subscription expired and removed — user must re-subscribe' });
    }
    console.error("Push Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
