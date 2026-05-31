import { Search, User, Users, Plus, Hash } from 'lucide-react';
import { useState } from 'react';

export default function ChatSidebar({ chats, activeChat, onSelectChat, onCreateGroup, employeeProfile, isAdmin, loading, unreadCounts = {}, onlineUsers = new Set() }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredChats = chats.filter(chat => {
    // If individual chat, match on the other person's name
    if (chat.type === 'individual') {
      const otherMember = chat.members?.find(m => m.employee_id !== employeeProfile.id);
      const name = otherMember?.employees?.full_name || 'Unknown User';
      return name.toLowerCase().includes(searchTerm.toLowerCase());
    }
    // For groups/announcements, match on chat name
    return (chat.name || 'Group Chat').toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-gray-800 text-lg">Chats</h2>
          {isAdmin && (
            <button 
              onClick={onCreateGroup}
              className="p-1.5 bg-gray-50 hover:bg-gray-100 text-navy rounded-lg transition-colors border border-gray-200"
              title="Create Group"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            type="text"
            placeholder="Search chats..."
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-accent outline-none font-medium text-gray-700"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="text-center p-4 text-xs text-gray-400">Loading...</div>
        ) : filteredChats.length === 0 ? (
          <div className="text-center p-4 text-xs text-gray-400 font-medium">No chats found.</div>
        ) : (
          filteredChats.map(chat => {
            const isGroup = chat.type === 'group' || chat.type === 'announcement';
            let chatName = chat.name || 'Group Chat';
            let Icon = isGroup ? (chat.type === 'announcement' ? Hash : Users) : User;
            let isOnline = false;
            if (!isGroup) {
              const otherMember = chat.members?.find(m => m.employee_id !== employeeProfile.id);
              chatName = otherMember?.employees?.full_name || 'Unknown User';
              // Check if the other person in a 1-1 chat is online
              if (otherMember && onlineUsers.has(otherMember.employee_id)) {
                isOnline = true;
              }
            }

            const isActive = activeChat?.id === chat.id;
            const unreadCount = unreadCounts[chat.id] || 0;

            return (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat)}
                className={`w-full text-left flex items-center gap-3 p-3 rounded-xl transition-colors ${
                  isActive ? 'bg-navy/5 border border-navy/10' : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="relative">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                    isGroup ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-gray-100 text-gray-500 border border-gray-200'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {isOnline && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className={`text-sm font-bold truncate ${isActive ? 'text-navy' : 'text-gray-800'}`}>
                      {chatName}
                    </h3>
                    {unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ml-2">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                  {isGroup && (
                    <p className="text-[10px] text-gray-400 truncate uppercase tracking-wider font-bold">
                      {chat.type} â€¢ {chat.members?.length || 0} Members
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
