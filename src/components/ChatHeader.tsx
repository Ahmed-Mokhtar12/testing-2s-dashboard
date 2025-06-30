
import React from 'react';
import { Button } from '@/components/ui/button';

interface ChatHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ sidebarOpen, onToggleSidebar }) => {
  return (
    <div className="h-12 border-b border-gray-200 flex items-center px-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleSidebar}
        className="mr-2"
      >
        ☰
      </Button>
      <h2 className="text-lg font-medium text-gray-900">Two Seasons Assistant</h2>
    </div>
  );
};

export default ChatHeader;
