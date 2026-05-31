'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { MessageSquare, Users, Search, Plus } from 'lucide-react';
import MobilePageHeader from '@/components/ui/MobilePageHeader';
import ChatSidebar from './components/ChatSidebar';
import ChatWindow from './components/ChatWindow';
import CreateGroupModal from './components/CreateGroupModal';

export default function MessagesPage() {
  const { employeeProfile, isAdmin, loading: authLoading } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [initialPinnedItem, setInitialPinnedItem] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const pinType = params.get('pin_type');
      const pinId = params.get('pin_id');
      const pinTitle = params.get('pin_title');
      if (pinType && pinId) {
        setInitialPinnedItem({ type: pinType, id: pinId, title: pinTitle || 'Pinned Item' });
      }
    }
  }, []);
  
  // Real-time subscription to chats
  useEffect(() => {
    if (!employeeProfile) return;
    fetchChats();
    
    const channel = supabase.channel('chats_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
        fetchChats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchUnreadCounts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members', filter: `employee_id=eq.${employeeProfile.id}` }, () => {
        fetchChats();
      })
      .subscribe();
      
    return () => supabase.removeChannel(channel);
  }, [employeeProfile]);

  useEffect(() => {
    if (!employeeProfile) return;
    fetchUnreadCounts();

    const presenceChannel = supabase.channel('messaging_online_status', {
      config: { presence: { key: employeeProfile.id } }
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const onlineIds = new Set(Object.keys(state));
        setOnlineUsers(onlineIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ user_id: employeeProfile.id, online_at: new Date().toISOString() });
        }
      });

    return () => supabase.removeChannel(presenceChannel);
  }, [employeeProfile]);

  const fetchUnreadCounts = async () => {
    try {
      const { data, error } = await supabase.rpc('get_unread_message_counts');
      if (error) throw error;
      const countsMap = {};
      data?.forEach(row => { countsMap[row.chat_id] = parseInt(row.unread_count); });
      setUnreadCounts(countsMap);
    } catch (err) {
      console.error('Failed to fetch unread counts', err);
    }
  };

  const fetchChats = async () => {
    try {
      // Fetch chats where the user is a member
      const { data: memberData, error: memberErr } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('employee_id', employeeProfile.id);
        
      if (memberErr) throw memberErr;
      if (!memberData || memberData.length === 0) {
        setChats([]);
        setLoading(false);
        return;
      }
      
      const chatIds = memberData.map(m => m.chat_id);
      
      const { data: chatsData, error: chatsErr } = await supabase
        .from('chats')
        .select('*, members:chat_members(employee_id, employees!chat_members_employee_id_fkey(full_name))')
        .in('id', chatIds)
        .order('created_at', { ascending: false });
        
      if (chatsErr) throw chatsErr;
      
      setChats(chatsData || []);
    } catch (err) {
      console.error('Error fetching chats:', err);
      toast.error('Failed to load chats');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectChat = (chat) => {
    setActiveChat(chat);
  };

  if (authLoading) return <div className="p-8 text-center text-gray-400 font-medium">Loading messages...</div>;

  return (
    <div className="page-container h-[calc(100vh-6rem)] flex flex-col md:overflow-hidden">
      <MobilePageHeader
        icon={MessageSquare}
        title="Messages"
        subtitle="Team communication and discussions."
        action={
          <button onClick={() => setShowCreateGroup(true)} className="w-10 h-10 rounded-2xl bg-navy text-white flex items-center justify-center shadow-sm" aria-label="New Chat">
            <Plus className="w-5 h-5" />
          </button>
        }
      />

      <div className="hidden md:flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Messages</h1>
          <p className="text-sm text-gray-500 mt-1">Discuss tasks, batches, and chat with team members.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden bg-white rounded-2xl border border-gray-200 shadow-sm min-h-0">
        <div className={`w-full md:w-80 lg:w-96 border-r border-gray-100 flex-shrink-0 flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'}`}>
          <ChatSidebar 
            chats={chats} 
            activeChat={activeChat} 
            onSelectChat={handleSelectChat}
            onCreateGroup={() => setShowCreateGroup(true)}
            employeeProfile={employeeProfile}
            isAdmin={isAdmin}
            loading={loading}
            unreadCounts={unreadCounts}
            onlineUsers={onlineUsers}
          />
        </div>
        
        <div className={`flex-1 flex flex-col min-w-0 bg-gray-50/30 ${!activeChat ? 'hidden md:flex' : 'flex'}`}>
          {activeChat ? (
            <ChatWindow 
              chat={activeChat} 
              employeeProfile={employeeProfile} 
              onBack={() => setActiveChat(null)}
              initialPinnedItem={initialPinnedItem}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <MessageSquare className="w-12 h-12 mb-3 opacity-20" />
              <p className="font-semibold text-sm">Select a chat to start messaging</p>
            </div>
          )}
        </div>
      </div>

      {showCreateGroup && (
        <CreateGroupModal 
          onClose={() => setShowCreateGroup(false)} 
          onSuccess={(newChat) => {
            fetchChats();
            setActiveChat(newChat);
            setShowCreateGroup(false);
          }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
