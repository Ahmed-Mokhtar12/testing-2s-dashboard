
import React from 'react';
import { Button } from '@/components/ui/button';

interface ChatHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ sidebarOpen, onToggleSidebar }) => {
  return (
    <div className="h-14 border-b border-gray-200 flex items-center px-4 bg-white shadow-sm">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleSidebar}
        className="mr-3 hover:bg-gray-100"
      >
        ☰
      </Button>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-[#C8A351] to-[#B8934A] rounded-full flex items-center justify-center">
          <span className="text-white font-bold text-xs">TS</span>
        </div>
        <div>
          <h2 className="text-lg font-medium text-gray-900">مستشار فندق Two Seasons الذكي</h2>
          <p className="text-xs text-gray-500">مساعدك الذكي المتخصص في إدارة الفنادق</p>
        </div>
      </div>
      <div className="ml-auto">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>متصل</span>
        </div>
      </div>
    </div>
  );
};

export default ChatHeader;
