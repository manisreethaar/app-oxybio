import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    // SECURITY: Ensure the requester is authenticated
    const supabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const authHeader = req.headers.get('Authorization');
    
    // Check if it's an internal server request or an authenticated user
    const { data: { user }, error: authError } = await createServerClient().auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized push trigger' }, { status: 401 });
    }

    const { assigned_to, title, body, url } = await req.json();
    if (!assigned_to) return NextResponse.json({ error: 'Missing assignee ID' }, { status: 400 });

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'No Service Key configured' }, { status: 500 });
    
    // Admin client to bypass RLS and securely query push keys
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: employee, error: dbError } = await supabaseAdmin
      .from('employees')
      .select('push_subscription')
      .eq('id', assigned_to)
      .single();

    if (dbError || !employee || !employee.push_subscription) {
      return NextResponse.json({ success: false, reason: 'Device not opted in to push notifications' });
    }

    webpush.setVapidDetails(
      'mailto:founder@oxybio.in',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const stringSub = typeof employee.push_subscription === 'string' ? JSON.parse(employee.push_subscription) : employee.push_subscription;

    await webpush.sendNotification(stringSub, JSON.stringify({
      title: title || 'New Activity Assigned',
      body: body || 'Open OxyOS to view details.',
      url: url || '/tasks'
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error.statusCode === 410) {
      return NextResponse.json({ success: false, reason: 'Push subscription expired from user device' });
    }
    console.error("Push Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
