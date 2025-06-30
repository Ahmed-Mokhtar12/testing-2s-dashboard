import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, LayoutDashboard, LogIn, Settings } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
}

interface SidebarProps {
  sidebarOpen: boolean;
  chatSessions: ChatSession[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSessionSelect: (sessionId: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  sidebarOpen,
  chatSessions,
  activeSessionId,
  onNewChat,
  onSessionSelect
}) => {
  return (
    <div className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 bg-[#1E1E1E] text-white flex flex-col overflow-hidden`}>
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden">
            <img 
              src="/lovable-uploads/38d2caf1-df62-49c4-a397-a2e574d4575e.png" 
              alt="Hotel Logo" 
              className="w-6 h-6 object-contain"
            />
          </div>
          <h1 className="text-lg font-semibold">Two Seasons GPT</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={onNewChat}
            className="flex-1 bg-transparent border border-gray-600 hover:bg-gray-700 text-white flex items-center gap-2"
          >
            <Plus size={16} />
            New Chat
          </Button>
          <Button variant="ghost" size="sm" className="text-white hover:bg-gray-700 px-2">
            <LayoutDashboard size={16} />
          </Button>
          <Button variant="ghost" size="sm" className="text-white hover:bg-gray-700 px-2">
            <LogIn size={16} />
          </Button>
        </div>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {chatSessions.map((session) => (
            <div
              key={session.id}
              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                activeSessionId === session.id 
                  ? 'bg-gray-700' 
                  : 'hover:bg-gray-800'
              }`}
              onClick={() => onSessionSelect(session.id)}
            >
              <div className="text-sm font-medium truncate">{session.title}</div>
              <div className="text-xs text-gray-400 truncate">{session.lastMessage}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-white hover:bg-gray-700">
            <Settings size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
