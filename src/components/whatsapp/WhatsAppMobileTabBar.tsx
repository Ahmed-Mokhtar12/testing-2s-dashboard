import React from 'react';
import { CircleDashed, Phone, Users, MessageCircle, Settings } from 'lucide-react';

interface TabItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: number;
}

const tabs: TabItem[] = [
  { key: 'updates', label: 'Updates', icon: CircleDashed },
  { key: 'calls', label: 'Calls', icon: Phone, badge: 30 },
  { key: 'communities', label: 'Communities', icon: Users },
  { key: 'chats', label: 'Chats', icon: MessageCircle, badge: 9 },
  { key: 'settings', label: 'Settings', icon: Settings },
];

interface Props {
  active?: string;
}

const WhatsAppMobileTabBar: React.FC<Props> = ({ active = 'chats' }) => {
  return (
    <div className="flex items-center justify-around bg-[#F7F7F7] border-t border-gray-200 pt-1.5 pb-6 px-1 shrink-0">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            className="relative flex flex-col items-center justify-center gap-0.5 flex-1 py-1"
          >
            <div className="relative">
              <Icon
                size={26}
                className={isActive ? 'text-[#111B21]' : 'text-[#54656F]'}
              />
              {tab.badge && tab.badge > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-[#25D366] text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center border-2 border-[#F7F7F7]">
                  {tab.badge}
                </span>
              )}
            </div>
            <span
              className={`text-[10px] font-medium ${
                isActive ? 'text-[#111B21] font-semibold' : 'text-[#54656F]'
              }`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default WhatsAppMobileTabBar;
