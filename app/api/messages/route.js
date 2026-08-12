import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const supabase = createClient();
    const { data: { session }, error: authErr } = await supabase.auth.getSession();
    
    if (authErr || !session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: employeeData, error: empErr } = await supabase
      .from('employees')
      .select('id, employee_code, role, is_admin')
      .eq('id', session.user.id)
      .single();

    if (empErr || !employeeData) {
      return NextResponse.json({ success: false, error: 'Employee profile not found' }, { status: 403 });
    }

    // 1. Fetch chats where the user is a member
    const { data: memberData, error: memberErr } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('employee_id', employeeData.id);

    if (memberErr) throw memberErr;

    if (!memberData || memberData.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const chatIds = memberData.map(m => m.chat_id);

    // 2. Fetch the chat details and their members
    const { data: chatsData, error: chatsErr } = await supabase
      .from('chats')
      .select('*, members:chat_members(employee_id, employees!chat_members_employee_id_fkey(full_name))')
      .in('id', chatIds)
      .order('created_at', { ascending: false });

    if (chatsErr) throw chatsErr;

    // 3. Fetch the latest message for each chat
    const latestMessages = await Promise.all(
      chatIds.map(async (chatId) => {
        const { data } = await supabase
          .from('messages')
          .select('id, content, created_at, sender_id')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return { chatId, message: data };
      })
    );

    // Merge latest message into chatsData
    const chatsWithLastMessage = chatsData.map(chat => {
      const lm = latestMessages.find(m => m.chatId === chat.id);
      return {
        ...chat,
        messages: lm && lm.message ? [lm.message] : []
      };
    });

    return NextResponse.json({ success: true, data: chatsWithLastMessage });

  } catch (err) {
    console.error('Failed to fetch chats:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
