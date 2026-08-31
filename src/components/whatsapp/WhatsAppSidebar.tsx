import React from 'react';
import { Search, MessageSquarePlus, MoreVertical } from 'lucide-react';
import {
  type ChatPreview,
  formatPhoneNumber,
  getAvatarColor,
  getInitials,
} from '@/lib/whatsappUi';
import { ChatListSkeleton, ChatListError } from './ChatListStates';
import { formatChatTimestamp } from '@/lib/whatsappTime';

interface WhatsAppSidebarProps {
  chats: ChatPreview[];
  selectedNumber: string;
  onSelectChat: (number: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isLoading: boolean;
  loadError?: boolean;
  onRetry?: () => void;
  connectionDown?: boolean;
}

const WhatsAppSidebar: React.FC<WhatsAppSidebarProps> = ({
  chats,
  selectedNumber,
  onSelectChat,
  searchQuery,
  onSearchChange,
  isLoading,
  loadError,
  onRetry,
  connectionDown,
}) => {
  const filteredChats = chats.filter(chat => {
    const q = searchQuery.toLowerCase();
    return chat.senderNumber.includes(searchQuery) || 
      chat.lastMessage.toLowerCase().includes(q) ||
      (chat.name && chat.name.toLowerCase().includes(q));
  });

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white">
        <span className="text-[#111B21] font-semibold text-2xl tracking-tight">Chats</span>
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
            placeholder="Search or start a new chat"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-transparent flex-1 text-sm text-[#3B4A54] placeholder-[#667781] focus:outline-none"
          />
        </div>
      </div>

      {/* Live-updates connection warning (list refetches on a timer meanwhile) */}
      {connectionDown && (
        <div className="bg-[#FFF3C4] text-[#54656F] text-xs px-4 py-2 border-b border-[#F0E6B2]">
          Reconnecting — new messages may be delayed.
        </div>
      )}

      {/* Filter chips (All/Unread/Favourites/Groups) and the decorative
          "Locked chats" row were removed: the chips never filtered anything
          and there is no unread/favourite/group/locked concept yet. The chip
          row returns with Phase-2 unread tracking, wired to real data. */}

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <ChatListSkeleton />
        ) : loadError ? (
          <ChatListError onRetry={onRetry} />
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
                    {formatChatTimestamp(chat.lastActivityAt)}
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
