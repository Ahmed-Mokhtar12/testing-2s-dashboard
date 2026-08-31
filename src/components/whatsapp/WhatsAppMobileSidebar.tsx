import React from 'react';
import { Search, MoreHorizontal, Camera, Plus } from 'lucide-react';

interface ChatPreview {
  senderNumber: string;
  name?: string;
  lastMessage: string;
  timestamp: string;
  unreadCount?: number;
  avatar?: string;
}

interface Props {
  chats: ChatPreview[];
  selectedNumber: string;
  onSelectChat: (number: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isLoading: boolean;
}

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
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || number.slice(-2);
  }
  return number.slice(-2);
};

const formatPhoneNumber = (number: string) => {
  if (number.startsWith('971')) {
    return `+${number.slice(0, 3)} ${number.slice(3, 5)} ${number.slice(5, 8)} ${number.slice(8)}`;
  }
  return `+${number}`;
};

const WhatsAppMobileSidebar: React.FC<Props> = ({
  chats, selectedNumber, onSelectChat, searchQuery, onSearchChange, isLoading,
}) => {
  const filteredChats = chats.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.senderNumber.includes(searchQuery) ||
      c.lastMessage.toLowerCase().includes(q) ||
      (c.name && c.name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top bar with menu / camera / plus */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <button className="w-9 h-9 rounded-full bg-[#F0F2F5] flex items-center justify-center">
          <MoreHorizontal size={20} className="text-[#111B21]" />
        </button>
        <div className="flex items-center gap-3">
          <button className="w-9 h-9 flex items-center justify-center">
            <Camera size={22} className="text-[#111B21]" />
          </button>
          <button className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center">
            <Plus size={22} className="text-white" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* "Chats" big title */}
      <div className="px-4 pb-2">
        <h1 className="text-[34px] font-bold text-[#111B21] leading-tight">Chats</h1>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="flex items-center bg-[#F0F2F5] rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-[#8696A0] mr-2" />
          <input
            type="text"
            placeholder="Search or start a new chat"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="min-h-[44px] bg-transparent flex-1 text-[15px] text-[#111B21] placeholder-[#8696A0] focus:outline-none"
          />
        </div>
      </div>

      {/* Filter chips removed until Phase-2 unread tracking gives them real
          data — they only changed their own styling before. */}

      {/* Chat list */}
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
            <button
              key={chat.senderNumber}
              onClick={() => onSelectChat(chat.senderNumber)}
              className={`w-full flex items-center gap-3 pl-4 pr-4 py-2.5 text-left transition-colors ${
                selectedNumber === chat.senderNumber ? 'bg-[#F0F2F5]' : 'active:bg-[#F5F6F6]'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-base ${getAvatarColor(chat.senderNumber)}`}
              >
                {chat.avatar ? (
                  <img src={chat.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span>{getInitials(chat.name, chat.senderNumber)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0 border-b border-[#E9EDEF] pb-2.5 -mb-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[16px] text-[#111B21] truncate">
                    {chat.name || formatPhoneNumber(chat.senderNumber)}
                  </span>
                  <span
                    className={`text-[12px] ml-2 shrink-0 ${
                      chat.unreadCount ? 'text-[#25D366] font-medium' : 'text-[#667781]'
                    }`}
                  >
                    {chat.timestamp}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p dir="auto" className="text-[14px] text-[#667781] truncate pr-2">{chat.lastMessage}</p>
                  {(chat.unreadCount ?? 0) > 0 && (
                    <span className="bg-[#25D366] text-white text-[11px] font-semibold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shrink-0">
                      {chat.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default WhatsAppMobileSidebar;
