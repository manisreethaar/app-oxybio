'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, User, Users, Hash, Paperclip, ExternalLink, CheckCheck, MoreVertical, Edit2, Reply, Trash2, File, Search, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useToast } from '@/context/ToastContext';
import MessageInput from './MessageInput';
import Link from 'next/link';

export default function ChatWindow({ chat, employeeProfile, onBack, initialPinnedItem }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [activeMessageId, setActiveMessageId] = useState(null);

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
        fetchSingleMessage(payload.new.id);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chat.id}`
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
      })
      .subscribe();

    // Setup Typing Presence
    const typingChannel = supabase.channel(`typing_${chat.id}`, {
      config: { presence: { key: employeeProfile.id } }
    });

    typingChannel
      .on('presence', { event: 'sync' }, () => {
        const state = typingChannel.presenceState();
        const typingIds = new Set(
          Object.keys(state)
          .filter(id => id !== employeeProfile.id && state[id][0]?.typing)
        );
        setTypingUsers(typingIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track initial not-typing state
          await typingChannel.track({ typing: false });
        }
      });

    // We can expose a global function to trigger typing status from MessageInput,
    // but to keep it simple, we'll just omit sending typing events for now and only listen if they existed.
    // Ideally, MessageInput onChange would call a debounced function to track({ typing: true }).

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(typingChannel);
    };
  }, [chat?.id]);

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
      const { data, error } = await withTimeout(supabase
        .from('messages')
        .select('*, sender:employees!messages_sender_id_fkey(full_name)')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: true }), 20000, 'Messages load timed out');

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

  const handleDelete = async (msgId) => {
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      const { error } = await supabase
        .from('messages')
        .update({ 
          is_deleted: true, 
          content: null, 
          image_url: null, 
          attachment_url: null, 
          pinned_item_id: null 
        })
        .eq('id', msgId);
      if (error) throw error;
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete message');
    }
  };

  const renderPinnedItem = (msg) => {
    if (!msg.pinned_item_type || msg.pinned_item_type === 'none') return null;
    
    let link = '#';
    let iconBg = 'bg-slate-100';
    let iconText = 'text-slate-500';
    
    if (msg.pinned_item_type === 'task') {
      link = '/tasks';
      iconBg = 'bg-slate-100';
      iconText = 'text-slate-600';
    } else if (msg.pinned_item_type === 'batch') {
      link = `/batches/${msg.pinned_item_id}`;
      iconBg = 'bg-slate-100';
      iconText = 'text-slate-600';
    } else if (msg.pinned_item_type === 'activity') {
      link = '/activity';
      iconBg = 'bg-emerald-100';
      iconText = 'text-emerald-600';
    }

    return (
      <Link href={link} className="flex items-center gap-2 mt-2 bg-slate-50/80 border border-slate-200 rounded-lg p-2 hover:bg-slate-100 transition-colors w-full sm:max-w-xs group no-underline text-inherit">
        <div className={`w-8 h-8 rounded shrink-0 flex items-center justify-center ${iconBg} ${iconText}`}>
          <Paperclip className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase font-bold text-slate-400 mb-0.5">{msg.pinned_item_type}</p>
          <p className="text-xs font-semibold truncate text-slate-700">Ref: {msg.pinned_item_id}</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </Link>
    );
  };

  const filteredMessages = messages.filter(msg => {
    if (!searchQuery) return true;
    return msg.content?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full bg-white md:rounded-r-2xl w-full">
      {/* Header */}
      <div className="h-16 border-b border-slate-100 px-4 flex items-center shrink-0">
        <button 
          onClick={onBack}
          className="md:hidden mr-3 p-2 -ml-2 text-slate-400 hover:text-navy hover:bg-slate-50 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm mr-3 ${
          isGroup ? 'bg-slate-50 text-slate-600 border border-slate-100' : 'bg-slate-100 text-slate-500 border border-slate-200'
        }`}>
          <Icon className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 truncate">{chatName}</h2>
            {isGroup && (
              <p className="text-xs uppercase tracking-wider font-bold text-slate-400">
                {chat.type} • {chat.members?.length || 0} Members
              </p>
            )}
          </div>
          
          <button onClick={() => setIsSearchOpen(!isSearchOpen)} className={`p-2 rounded-xl transition-colors ${isSearchOpen ? 'bg-navy/10 text-navy' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}>
            <Search className="w-5 h-5" />
          </button>
        </div>
      </div>

      {isSearchOpen && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 animate-in slide-in-from-top-1">
          <Search className="w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search messages..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm font-medium outline-none text-slate-700"
            autoFocus
          />
          <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50" onClick={() => setActiveMessageId(null)}>
        {loading ? (
          <div className="text-center py-10 text-slate-400 font-medium text-sm">Loading messages...</div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-center py-10 text-slate-400 font-medium text-sm flex flex-col items-center">
            {searchQuery ? (
              <>
                <Search className="w-8 h-8 mb-3 opacity-20" />
                No messages found for &quot;{searchQuery}&quot;
              </>
            ) : (
              <>
                <Icon className="w-12 h-12 mb-3 opacity-20" />
                No messages yet. Send the first message!
              </>
            )}
          </div>
        ) : (
          filteredMessages.map((msg, idx) => {
            const isMe = msg.sender_id === employeeProfile.id;
            const showName = isGroup && !isMe && (idx === 0 || filteredMessages[idx - 1].sender_id !== msg.sender_id);
            
            const replyMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;

            const isActive = activeMessageId === msg.id;
            const actionClass = `transition-opacity flex items-center gap-1 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`;

            return (
              <div key={msg.id} className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}>
                {showName && (
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 ml-1">
                    {msg.sender?.full_name || 'Unknown'}
                  </span>
                )}

                <div className="flex items-center gap-2 max-w-full">

                  {isMe && !msg.is_deleted && (
                    <div className={actionClass}>
                      <button onClick={(e) => { e.stopPropagation(); setEditingMessage(msg); setActiveMessageId(null); }} className="p-1 text-slate-400 hover:text-navy hover:bg-slate-100 rounded" title="Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(msg.id); setActiveMessageId(null); }} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {!isMe && !msg.is_deleted && (
                    <div className={`${actionClass} order-last`}>
                      <button onClick={(e) => { e.stopPropagation(); setReplyingToMessage(msg); setActiveMessageId(null); }} className="p-1 text-slate-400 hover:text-navy hover:bg-slate-100 rounded" title="Reply">
                        <Reply className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div
                    onClick={(e) => { e.stopPropagation(); setActiveMessageId(isActive ? null : msg.id); }}
                    className={`relative max-w-[280px] sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl rounded-2xl px-4 py-2 shadow-sm cursor-pointer select-none ${
                      isMe ? 'bg-navy text-white rounded-br-sm' : 'bg-white border border-slate-100 text-slate-800 rounded-bl-sm'
                    }`}
                  >
                    {msg.is_deleted ? (
                      <p className="text-sm italic opacity-60">This message was deleted</p>
                    ) : (
                      <>
                        {replyMsg && (
                          <div className={`mb-2 pl-3 py-1 text-xs border-l-2 rounded-r-md bg-black/5 ${isMe ? 'border-white/50 text-white/90' : 'border-slate-300 text-slate-600'}`}>
                            <span className="font-bold opacity-80 block mb-0.5">{replyMsg.sender?.full_name || 'Someone'}</span>
                            <span className="line-clamp-1 opacity-90">{replyMsg.content || 'Attachment'}</span>
                          </div>
                        )}

                        {msg.content && <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>}

                        {msg.image_url && (
                          <div className="mt-2 rounded-xl overflow-hidden border border-black/10">
                            <img src={msg.image_url} alt="Attachment" className="max-w-full h-auto max-h-64 object-contain bg-black/5" loading="lazy" />
                          </div>
                        )}

                        {msg.attachment_url && (
                          <a href={msg.attachment_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={`mt-2 flex items-center gap-2 p-2 rounded-lg border ${isMe ? 'bg-white/10 border-white/20 hover:bg-white/20' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'} transition-colors no-underline`}>
                            <File className={`w-5 h-5 ${isMe ? 'text-white' : 'text-slate-500'}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-bold truncate ${isMe ? 'text-white' : 'text-slate-700'}`}>{msg.attachment_name}</p>
                            </div>
                          </a>
                        )}

                        {renderPinnedItem(msg)}

                        <div className={`text-xs font-bold mt-1.5 opacity-60 flex items-center gap-1 ${isMe ? 'justify-end text-white/80' : 'justify-start text-slate-400'}`}>
                          {msg.is_edited && <span className="mr-1 italic">(edited)</span>}
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {isMe && msg.read_by && msg.read_by.length > 0 && (
                            <CheckCheck className="w-3.5 h-3.5" />
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {isMe && !msg.is_deleted && (
                    <div className={`${actionClass} order-last`}>
                      <button onClick={(e) => { e.stopPropagation(); setReplyingToMessage(msg); setActiveMessageId(null); }} className="p-1 text-slate-400 hover:text-navy hover:bg-slate-100 rounded" title="Reply">
                        <Reply className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

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
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
        replyingToMessage={replyingToMessage}
        onCancelReply={() => setReplyingToMessage(null)}
      />
    </div>
  );
}
