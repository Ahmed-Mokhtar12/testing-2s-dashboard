
import React from 'react';
import { Button } from '@/components/ui/button';

interface ChatHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  sidebarOpen,
  onToggleSidebar
}) => {
  return (
    <div className="h-14 border-b border-gray-200 flex items-center px-4 bg-white shadow-sm flex-shrink-0">
      <Button variant="ghost" size="sm" onClick={onToggleSidebar} className="mr-3 hover:bg-gray-100">
        ☰
      </Button>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-[#C8A351] to-[#B8934A] rounded-full flex items-center justify-center">
          <span className="text-white font-bold text-xs">TS</span>
        </div>
        <div>
          <h2 className="text-lg font-medium text-gray-900">Two Seasons Hotel AI Assistance</h2>
          <p className="text-xs text-gray-500">Your intelligent assistant specialized in hotel management</p>
        </div>
      </div>
      <div className="ml-auto">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Online</span>
        </div>
      </div>
    </div>
  );
};

export default ChatHeader;
