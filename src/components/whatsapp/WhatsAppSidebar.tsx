import React, { useState } from 'react';
import { Search, MessageSquarePlus, MoreVertical, Lock } from 'lucide-react';

interface ChatPreview {
  senderNumber: string;
  name?: string;
  lastMessage: string;
  timestamp: string;
  unreadCount?: number;
  avatar?: string;
}

interface WhatsAppSidebarProps {
  chats: ChatPreview[];
  selectedNumber: string;
  onSelectChat: (number: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isLoading: boolean;
}

const WhatsAppSidebar: React.FC<WhatsAppSidebarProps> = ({
  chats,
  selectedNumber,
  onSelectChat,
  searchQuery,
  onSearchChange,
  isLoading,
}) => {
  const [activeFilter, setActiveFilter] = useState('All');

  // Compute counters from chats
  const unreadCount = chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
  const filters: { key: string; label: string; count?: number }[] = [
    { key: 'All', label: 'All' },
    { key: 'Unread', label: 'Unread', count: unreadCount },
    { key: 'Favourites', label: 'Favourites' },
    { key: 'Groups', label: 'Groups' },
  ];

  const filteredChats = chats.filter(chat => {
    const q = searchQuery.toLowerCase();
    return chat.senderNumber.includes(searchQuery) || 
      chat.lastMessage.toLowerCase().includes(q) ||
      (chat.name && chat.name.toLowerCase().includes(q));
  });

  const formatPhoneNumber = (number: string) => {
    if (number.startsWith('971')) {
      return `+${number.slice(0, 3)} ${number.slice(3, 5)} ${number.slice(5, 8)} ${number.slice(8)}`;
    }
    return `+${number}`;
  };

  // Deterministic color palette for avatars
  const avatarColors = [
    'bg-[#F44336]', 'bg-[#E91E63]', 'bg-[#9C27B0]', 'bg-[#673AB7]',
    'bg-[#3F51B5]', 'bg-[#2196F3]', 'bg-[#009688]', 'bg-[#4CAF50]',
    'bg-[#FF9800]', 'bg-[#FF5722]', 'bg-[#795548]', 'bg-[#607D8B]',
  ];

  const getAvatarColor = (key: string) => {
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return avatarColors[hash % avatarColors.length];
  };

  const getInitials = (name: string | undefined, number: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      const first = parts[0]?.[0] ?? '';
      const second = parts[1]?.[0] ?? '';
      return (first + second).toUpperCase() || number.slice(-2);
    }
    return number.slice(-2);
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white">
        <span className="text-[#111B21] font-semibold text-2xl tracking-tight">WhatsApp</span>
        <div className="flex items-center gap-4 text-[#54656F]">
          <MessageSquarePlus className="w-5 h-5 cursor-pointer hover:text-[#111B21]" />
          <MoreVertical className="w-5 h-5 cursor-pointer hover:text-[#111B21]" />
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3 py-2 bg-white">
        <div className="flex items-center bg-[#F0F2F5] rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-[#54656F] mr-3" />
          <input
            type="text"
            placeholder="Ask Meta AI or Search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-transparent flex-1 text-sm text-[#3B4A54] placeholder-[#667781] focus:outline-none"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto">
        {filters.map((filter) => {
          const isActive = activeFilter === filter.key;
          const showCount = filter.count !== undefined && filter.count > 0;
          return (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-[#D9FDD3] text-[#0a5c45]'
                  : 'bg-[#F0F2F5] text-[#54656F] hover:bg-[#E9EDEF]'
              }`}
            >
              <span>{filter.label}</span>
              {showCount && (
                <span className={isActive ? 'text-[#0a5c45]' : 'text-[#667781]'}>
                  {filter.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Locked Chats */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-[#F5F6F6]">
        <div className="w-12 h-12 bg-[#F0F2F5] rounded-full flex items-center justify-center">
          <Lock className="w-5 h-5 text-[#54656F]" />
        </div>
        <span className="text-[#111B21] font-medium">Locked chats</span>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-pulse text-[#667781] text-sm">Loading chats...</div>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex justify-center py-8">
            <span className="text-[#667781] text-sm">No conversations found</span>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.senderNumber}
              onClick={() => onSelectChat(chat.senderNumber)}
              className={`flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors ${
                selectedNumber === chat.senderNumber
                  ? 'bg-[#F0F2F5]'
                  : 'hover:bg-[#F5F6F6]'
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-base ${getAvatarColor(chat.senderNumber)}`}
              >
                {chat.avatar ? (
                  <img src={chat.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span>{getInitials(chat.name, chat.senderNumber)}</span>
                )}
              </div>

              {/* Chat Info */}
              <div className="flex-1 min-w-0 border-b border-gray-100 py-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#111B21] truncate">
                    {chat.name || formatPhoneNumber(chat.senderNumber)}
                  </span>
                  <span className={`text-xs ${chat.unreadCount ? 'text-[#25D366]' : 'text-[#667781]'}`}>
                    {chat.timestamp}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p dir="auto" className="text-sm text-[#667781] truncate pr-2">
                    {chat.lastMessage}
                  </p>
                  {(chat.unreadCount ?? 0) > 0 && (
                    <span className="bg-[#25D366] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                      {chat.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default WhatsAppSidebar;
