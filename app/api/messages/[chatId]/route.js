import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const supabase = createClient();
    const { chatId } = params;

    const { data: { session }, error: authErr } = await supabase.auth.getSession();
    
    if (authErr || !session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Optional: We could verify if the user is a member of the chat, 
    // but RLS on the messages table will enforce this automatically if correctly configured.
    // For safety, let's just fetch messages. The RLS will return empty array if not a member.
    
    const { data: messagesData, error: messagesErr } = await supabase
      .from('messages')
      .select('*, sender:employees!messages_sender_id_fkey(full_name)')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (messagesErr) throw messagesErr;

    // We can also trigger the RPC to mark as read here on the server
    await supabase.rpc('mark_messages_read', { p_chat_id: chatId });

    return NextResponse.json({ success: true, data: messagesData || [] });

  } catch (err) {
    console.error('Failed to fetch messages:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
