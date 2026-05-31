import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendServerNotification } from '@/utils/serverNotify';

export async function POST(req) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messageId } = await req.json();
    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    // Resolve the auth user's employee record (employees.id !== auth.uid())
    const { data: senderEmployee, error: senderErr } = await supabaseAdmin
      .from('employees')
      .select('id, full_name')
      .ilike('email', user.email)
      .single();

    if (senderErr || !senderEmployee) {
      return NextResponse.json({ error: 'Sender employee record not found' }, { status: 403 });
    }

    // 1. Fetch the message details
    const { data: message, error: msgError } = await supabaseAdmin
      .from('messages')
      .select('*, chats(name, type)')
      .eq('id', messageId)
      .single();

    if (msgError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Ensure the authenticated user is actually the sender of this message
    if (message.sender_id !== senderEmployee.id) {
      return NextResponse.json({ error: 'Unauthorized to notify for this message' }, { status: 403 });
    }

    const senderName = senderEmployee.full_name?.split(' ')[0] || 'Someone';

    // 2. Fetch other chat members (exclude the sender)
    const { data: members, error: membersError } = await supabaseAdmin
      .from('chat_members')
      .select('employee_id')
      .eq('chat_id', message.chat_id)
      .neq('employee_id', senderEmployee.id);

    if (membersError || !members || members.length === 0) {
      return NextResponse.json({ success: true, message: 'No other members to notify' });
    }

    // 3. Prepare the notification payload
    let title = 'New Message';
    let body = message.content || 'Sent an attachment';

    if (message.chats.type === 'group' || message.chats.type === 'announcement') {
      title = `New message in ${message.chats.name || 'Group'}`;
      body = `${senderName}: ${body}`;
    } else {
      title = `New message from ${senderName}`;
    }

    const url = `/messages`;

    // 4. Send notifications concurrently
    const notifyPromises = members.map(member =>
      sendServerNotification(member.employee_id, title, body, url, 'info')
    );

    await Promise.allSettled(notifyPromises);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Messages Notify API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
