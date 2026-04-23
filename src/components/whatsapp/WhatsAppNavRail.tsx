import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  CircleDashed,
  Megaphone,
  Users,
  Sparkles,
  Settings,
  User,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  key: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
}

const topItems: NavItem[] = [
  { key: 'chats', icon: MessageCircle, label: 'Chats', badge: 19 },
  { key: 'status', icon: CircleDashed, label: 'Status' },
  { key: 'channels', icon: Megaphone, label: 'Channels' },
  { key: 'communities', icon: Users, label: 'Communities' },
  { key: 'meta-ai', icon: Sparkles, label: 'Meta AI' },
];

const bottomItems: NavItem[] = [
  { key: 'settings', icon: Settings, label: 'Settings' },
  { key: 'profile', icon: User, label: 'Profile' },
];

const WhatsAppNavRail: React.FC = () => {
  const [active, setActive] = useState('chats');
  const navigate = useNavigate();

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = active === item.key;
    return (
      <button
        key={item.key}
        onClick={() => setActive(item.key)}
        title={item.label}
        className={`relative w-12 h-12 flex items-center justify-center rounded-lg transition-colors ${
          isActive
            ? 'bg-[#E7FCE8] text-[#128C7E]'
            : 'text-[#54656F] hover:bg-[#E9EDEF]'
        }`}
      >
        <Icon size={22} />
        {item.badge && item.badge > 0 && (
          <span className="absolute top-1 right-1 bg-[#25D366] text-white text-[10px] font-semibold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center justify-between w-16 h-full bg-[#F7F8FA] border-r border-gray-200 py-3 shrink-0">
      <div className="flex flex-col items-center gap-2">
        {topItems.map(renderItem)}
      </div>
      <div className="flex flex-col items-center gap-2">
        {/* Back to Dashboard */}
        <button
          onClick={() => navigate('/dashboard')}
          title="Back to Dashboard"
          className="w-12 h-12 flex items-center justify-center rounded-lg text-[#54656F] hover:bg-[#E9EDEF] hover:text-[#128C7E] transition-colors"
        >
          <LayoutDashboard size={22} />
        </button>
        <div className="w-8 h-px bg-gray-300 my-1" />
        {bottomItems.map(renderItem)}
      </div>
    </div>
  );
};

export default WhatsAppNavRail;
