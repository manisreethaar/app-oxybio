import { createClient } from '@/utils/supabase/server';
import { getRequestUser } from '@/utils/supabase/request-user';
import MessagesClient from './MessagesClient';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Messages - OxyOS' };

export default async function MessagesPage() {
  const supabase = createClient();
  const user = getRequestUser();
  if (!user) redirect('/login');

  const { data: employeeData, error: empErr } = await supabase.from('employees').select('id, employee_code, role').eq('id', user.id).single();
  if (empErr || !employeeData) redirect('/login');

  // Fetch chats
  const { data: memberData } = await supabase.from('chat_members').select('chat_id').eq('employee_id', employeeData.id);
  const chatIds = (memberData || []).map(m => m.chat_id);

  let chatsWithLastMessage = [];
  if (chatIds.length > 0) {
    const { data: chatsData } = await supabase
      .from('chats')
      .select('*, members:chat_members(employee_id, employees!chat_members_employee_id_fkey(full_name))')
      .in('id', chatIds)
      .order('created_at', { ascending: false });

    if (chatsData) {
      const latestMessages = await Promise.all(
        chatIds.map(async (chatId) => {
          const { data } = await supabase.from('messages').select('id, content, created_at, sender_id').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(1).maybeSingle();
          return { chatId, message: data };
        })
      );

      chatsWithLastMessage = chatsData.map(chat => {
        const lm = latestMessages.find(m => m.chatId === chat.id);
        return {
          ...chat,
          messages: lm && lm.message ? [lm.message] : []
        };
      });
    }
  }

  // Fetch unread counts
  let unreadCounts = {};
  const { data: countsData } = await supabase.rpc('get_unread_message_counts');
  if (countsData) {
    countsData.forEach(row => { unreadCounts[row.chat_id] = parseInt(row.unread_count); });
  }

  return <MessagesClient initialChats={chatsWithLastMessage} initialUnreadCounts={unreadCounts} />;
}
