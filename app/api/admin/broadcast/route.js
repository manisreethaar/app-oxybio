import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { broadcastServerNotification } from '@/utils/serverNotify';

export async function POST(req) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // Verify user is an admin
    const { data: employee, error: empError } = await supabaseAdmin
      .from('employees')
      .select('role')
      .ilike('email', user.email)
      .single();

    if (empError || !employee || !['admin', 'ceo', 'cto'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { title, message, type = 'info', link = '/notifications' } = body;

    if (!title || !message) {
      return NextResponse.json({ error: 'Title and message are required' }, { status: 400 });
    }

    // Trigger broadcast asynchronously
    await broadcastServerNotification(title, message, link, type);

    return NextResponse.json({ success: true, message: 'Broadcast sent successfully' });
  } catch (error) {
    console.error('[Broadcast API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
