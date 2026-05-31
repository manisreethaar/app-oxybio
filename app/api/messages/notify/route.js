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

    // 1. Fetch the message details
    const { data: message, error: msgError } = await supabaseAdmin
      .from('messages')
      .select('*, chats(name, type)')
      .eq('id', messageId)
      .single();

    if (msgError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Ensure the sender is the one who triggered this
    if (message.sender_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to notify for this message' }, { status: 403 });
    }

    // Fetch sender's name
    const { data: sender } = await supabaseAdmin
      .from('employees')
      .select('full_name')
      .eq('id', user.id)
      .single();
    
    const senderName = sender?.full_name?.split(' ')[0] || 'Someone';

    // 2. Fetch other chat members
    const { data: members, error: membersError } = await supabaseAdmin
      .from('chat_members')
      .select('employee_id')
      .eq('chat_id', message.chat_id)
      .neq('employee_id', user.id);

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
      sendServerNotification(member.employee_id, title, body, url, 'message')
    );

    await Promise.allSettled(notifyPromises);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Messages Notify API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
