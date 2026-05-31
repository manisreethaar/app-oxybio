import { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, User, Users, Hash, Paperclip, ExternalLink, CheckCheck } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import MessageInput from './MessageInput';
import Link from 'next/link';

export default function ChatWindow({ chat, employeeProfile, onBack, initialPinnedItem }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const isGroup = chat.type === 'group' || chat.type === 'announcement';
  let chatName = chat.name || 'Group Chat';
  let Icon = isGroup ? (chat.type === 'announcement' ? Hash : Users) : User;

  if (!isGroup) {
    const otherMember = chat.members?.find(m => m.employee_id !== employeeProfile.id);
    chatName = otherMember?.employees?.full_name || 'Unknown User';
  }

  useEffect(() => {
    if (!chat?.id) return;
    
    fetchMessages();

    const channel = supabase.channel(`chat_${chat.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `chat_id=eq.${chat.id}` 
      }, (payload) => {
        // Fetch the sender details for the new message to match format
        fetchSingleMessage(payload.new.id);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chat.id}`
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, read_by: payload.new.read_by } : m));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chat?.id]);

  // Mark as read whenever messages update
  useEffect(() => {
    if (chat?.id && messages.length > 0) {
      supabase.rpc('mark_messages_read', { p_chat_id: chat.id })
        .then(({ error }) => {
          if (error) console.error('Failed to mark messages as read', error);
        });
    }
  }, [messages.length, chat?.id, supabase]);

  const fetchSingleMessage = async (messageId) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:employees!messages_sender_id_fkey(full_name)')
      .eq('id', messageId)
      .single();
      
    if (!error && data) {
      setMessages(prev => {
        if (prev.find(m => m.id === data.id)) return prev;
        return [...prev, data].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
      });
      setTimeout(scrollToBottom, 100);
    }
  };

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:employees!messages_sender_id_fkey(full_name)')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Fetch messages error:', err);
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const renderPinnedItem = (msg) => {
    if (!msg.pinned_item_type || msg.pinned_item_type === 'none') return null;
    
    let link = '#';
    let iconBg = 'bg-gray-100';
    let iconText = 'text-gray-500';
    
    if (msg.pinned_item_type === 'task') {
      link = '/tasks';
      iconBg = 'bg-blue-100';
      iconText = 'text-blue-600';
    } else if (msg.pinned_item_type === 'batch') {
      link = `/batches/${msg.pinned_item_id}`;
      iconBg = 'bg-indigo-100';
      iconText = 'text-indigo-600';
    } else if (msg.pinned_item_type === 'activity') {
      link = '/activity';
      iconBg = 'bg-emerald-100';
      iconText = 'text-emerald-600';
    }

    return (
      <Link href={link} className="flex items-center gap-2 mt-2 bg-gray-50/80 border border-gray-200 rounded-lg p-2 hover:bg-gray-100 transition-colors w-full sm:max-w-xs group no-underline text-inherit">
        <div className={`w-8 h-8 rounded shrink-0 flex items-center justify-center ${iconBg} ${iconText}`}>
          <Paperclip className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase font-bold text-gray-400 mb-0.5">{msg.pinned_item_type}</p>
          <p className="text-xs font-semibold truncate text-gray-700">Ref: {msg.pinned_item_id}</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </Link>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white md:rounded-r-2xl w-full">
      {/* Header */}
      <div className="h-16 border-b border-gray-100 px-4 flex items-center shrink-0">
        <button 
          onClick={onBack}
          className="md:hidden mr-3 p-2 -ml-2 text-gray-400 hover:text-navy hover:bg-gray-50 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm mr-3 ${
          isGroup ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-gray-100 text-gray-500 border border-gray-200'
        }`}>
          <Icon className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 truncate">{chatName}</h2>
          {isGroup && (
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
              {chat.type} â€¢ {chat.members?.length || 0} Members
            </p>
          )}
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
        {loading ? (
          <div className="text-center py-10 text-gray-400 font-medium text-sm">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-10 text-gray-400 font-medium text-sm flex flex-col items-center">
            <Icon className="w-12 h-12 mb-3 opacity-20" />
            No messages yet. Send the first message!
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_id === employeeProfile.id;
            const showName = isGroup && !isMe && (idx === 0 || messages[idx - 1].sender_id !== msg.sender_id);
            
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {showName && (
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 ml-1">
                    {msg.sender?.full_name || 'Unknown'}
                  </span>
                )}
                
                <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
                  isMe ? 'bg-navy text-white rounded-br-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {msg.content && <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>}
                  
                  {msg.image_url && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-black/10">
                      <img src={msg.image_url} alt="Attachment" className="max-w-full h-auto max-h-64 object-contain bg-black/5" loading="lazy" />
                    </div>
                  )}

                  {renderPinnedItem(msg)}

                  <div className={`text-[9px] font-bold mt-1.5 opacity-60 flex items-center gap-1 ${isMe ? 'justify-end text-white/80' : 'justify-start text-gray-400'}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {isMe && msg.read_by && msg.read_by.length > 0 && (
                      <CheckCheck className="w-3.5 h-3.5" />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <MessageInput 
        chatId={chat.id} 
        senderId={employeeProfile.id} 
        initialPinnedItem={initialPinnedItem}
      />
    </div>
  );
}
