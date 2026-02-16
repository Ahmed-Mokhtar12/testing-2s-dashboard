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
  const filters = ['All', 'Unread', 'Favourites', 'Groups'];

  const filteredChats = chats.filter(chat => 
    chat.senderNumber.includes(searchQuery) || 
    chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatPhoneNumber = (number: string) => {
    if (number.startsWith('971')) {
      return `+${number.slice(0, 3)} ${number.slice(3, 5)} ${number.slice(5, 8)} ${number.slice(8)}`;
    }
    return `+${number}`;
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#F0F2F5]">
        <span className="text-[#128C7E] font-semibold text-xl">WhatsApp</span>
        <div className="flex items-center gap-4 text-[#54656F]">
          <MessageSquarePlus className="w-5 h-5 cursor-pointer hover:text-[#128C7E]" />
          <MoreVertical className="w-5 h-5 cursor-pointer hover:text-[#128C7E]" />
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
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeFilter === filter
                ? 'bg-[#E7FCE8] text-[#128C7E]'
                : 'bg-[#F0F2F5] text-[#54656F] hover:bg-[#E9EDEF]'
            }`}
          >
            {filter}
          </button>
        ))}
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
              <div className="w-12 h-12 bg-[#DFE5E7] rounded-full flex items-center justify-center flex-shrink-0">
                {chat.avatar ? (
                  <img src={chat.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <svg viewBox="0 0 212 212" className="w-full h-full">
                    <path fill="#DFE5E7" d="M106.251.5C164.653.5 212 47.846 212 106.25S164.653 212 106.25 212C47.846 212 .5 164.654.5 106.25S47.846.5 106.251.5z"/>
                    <path fill="#FFF" d="M173.561 171.615a62.767 62.767 0 0 0-2.065-2.955 67.7 67.7 0 0 0-2.608-3.299 70.112 70.112 0 0 0-3.184-3.527 71.097 71.097 0 0 0-5.924-5.47 72.458 72.458 0 0 0-10.204-7.026 75.2 75.2 0 0 0-5.98-3.055c-.062-.028-.118-.059-.18-.087-9.792-4.44-22.106-7.529-37.416-7.529s-27.624 3.089-37.416 7.529c-.338.153-.653.318-.985.474a75.37 75.37 0 0 0-6.229 3.298 72.589 72.589 0 0 0-9.15 6.395 71.243 71.243 0 0 0-5.924 5.47 70.064 70.064 0 0 0-3.184 3.527 67.142 67.142 0 0 0-2.609 3.299 63.292 63.292 0 0 0-2.065 2.955 56.33 56.33 0 0 0-1.447 2.324c-.033.056-.073.119-.104.174a47.92 47.92 0 0 0-1.07 1.926c-.559 1.068-.818 1.678-.818 1.678v.398c18.285 17.927 43.322 28.985 70.945 28.985 27.678 0 52.761-11.103 71.055-29.095v-.289s-.619-1.45-1.992-3.778a58.346 58.346 0 0 0-1.446-2.322zM106.002 125.5c2.645 0 5.212-.253 7.68-.737a38.272 38.272 0 0 0 3.624-.896 37.124 37.124 0 0 0 5.12-1.958 36.307 36.307 0 0 0 6.15-3.67 35.923 35.923 0 0 0 9.489-10.48 36.558 36.558 0 0 0 2.422-4.84 37.051 37.051 0 0 0 1.716-5.25c.299-1.208.542-2.443.725-3.701.275-1.887.417-3.827.417-5.811s-.142-3.925-.417-5.811a38.734 38.734 0 0 0-1.215-5.494 36.68 36.68 0 0 0-3.648-8.298 35.923 35.923 0 0 0-9.489-10.48 36.347 36.347 0 0 0-6.15-3.67 37.124 37.124 0 0 0-5.12-1.958 37.67 37.67 0 0 0-3.624-.896 39.875 39.875 0 0 0-7.68-.737c-21.162 0-37.345 16.183-37.345 37.345 0 21.159 16.183 37.342 37.345 37.342z"/>
                  </svg>
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
                  <p className="text-sm text-[#667781] truncate pr-2">
                    {chat.lastMessage}
                  </p>
                  {chat.unreadCount && chat.unreadCount > 0 && (
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
