import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.SYSTEM_BOT_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized Bot Access' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();
    const { chat_id, message, alert_level } = await request.json();

    if (!chat_id || !message) {
      return NextResponse.json({ error: 'Missing required bot payload fields' }, { status: 400 });
    }

    // Insert bot message
    const { data, error } = await supabaseAdmin.from('messages').insert({
      chat_id,
      sender_id: '00000000-0000-0000-0000-000000000000', // System Bot ID
      content: message,
      is_system_alert: true,
      alert_level: alert_level || 'info', // 'info', 'warning', 'critical'
      created_at: new Date().toISOString()
    }).select().single();

    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
