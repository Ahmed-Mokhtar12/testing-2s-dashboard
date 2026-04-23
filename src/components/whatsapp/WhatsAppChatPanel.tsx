import { useEffect, useRef } from 'react';
import { Search, MoreVertical, UserCheck, Bot, Loader2 } from 'lucide-react';
import WhatsAppMessage from './WhatsAppMessage';
import WhatsAppInput from './WhatsAppInput';
import { WhatsAppMessage as MessageType } from '@/hooks/useWhatsAppChat';

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

const getDateLabel = (date: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

const isSameDay = (d1: Date, d2: Date): boolean =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

interface WhatsAppChatPanelProps {
  messages: MessageType[];
  senderNumber: string;
  isLoading: boolean;
  isLoadingHistory: boolean;
  isHumanControlled: boolean;
  isTogglingControl: boolean;
  onSendMessage: (message: string) => void;
  onToggleHumanControl: () => void;
}

const formatPhoneNumber = (number: string) => {
  if (number.startsWith('971')) {
    return `+${number.slice(0, 3)} ${number.slice(3, 5)} ${number.slice(5, 8)} ${number.slice(8)}`;
  }
  return `+${number}`;
};

const WhatsAppChatPanel: React.FC<WhatsAppChatPanelProps> = ({
  messages,
  senderNumber,
  isLoading,
  isLoadingHistory,
  isHumanControlled,
  isTogglingControl,
  onSendMessage,
  onToggleHumanControl,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initials = senderNumber.slice(-2);

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#F0F2F5] border-b border-gray-200 min-w-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Avatar with status badge */}
          <div className="relative shrink-0">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${getAvatarColor(senderNumber)}`}
            >
              {initials}
            </div>
            {/* AI/Human status badge */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#F0F2F5] ${
                isHumanControlled ? 'bg-orange-500' : 'bg-[#25D366]'
              }`}
              title={isHumanControlled ? 'Human Agent Active' : 'AI Responding'}
            >
              {isHumanControlled ? (
                <UserCheck size={8} className="text-white" strokeWidth={3} />
              ) : (
                <Bot size={8} className="text-white" strokeWidth={3} />
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-medium text-[#111B21] truncate">
              {formatPhoneNumber(senderNumber)}
            </h2>
            <p className="text-[11px] text-[#667781] truncate">
              {isHumanControlled ? 'Human Agent Active' : 'AI Responding'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[#54656F] shrink-0">
          {!isHumanControlled && (
            <button
              onClick={onToggleHumanControl}
              disabled={isTogglingControl}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm whitespace-nowrap bg-orange-500 text-white hover:bg-orange-600 border-2 border-orange-500 disabled:opacity-60"
            >
              {isTogglingControl ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <UserCheck size={12} />
              )}
              {isTogglingControl ? '...' : 'Take Over'}
            </button>
          )}

          <Search className="w-5 h-5 cursor-pointer hover:text-[#128C7E] shrink-0" />
          <MoreVertical className="w-5 h-5 cursor-pointer hover:text-[#128C7E] shrink-0" />
        </div>
      </div>


      {/* Human control banner */}
      {isHumanControlled && (
        <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 flex items-center justify-between gap-3 flex-wrap min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <UserCheck size={14} className="text-orange-500 shrink-0" />
            <p className="text-xs text-orange-700 truncate">
              <span className="font-semibold">Human Agent Mode:</span> AI paused. Messages sent directly to customer.
            </p>
          </div>
          <button
            onClick={onToggleHumanControl}
            disabled={isTogglingControl}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#128C7E] text-white hover:bg-[#0e6b5f] transition-all shadow-sm shrink-0 disabled:opacity-60 whitespace-nowrap"
          >
            {isTogglingControl ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
            Release to AI
          </button>
        </div>
      )}

      {/* Chat area */}
      <div 
        className="flex-1 overflow-y-auto px-16 py-2"
        style={{
          backgroundColor: '#E5DDD5',
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23C7BBA9' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {/* Loading history indicator */}
        {isLoadingHistory && (
          <div className="flex justify-center my-4">
            <div className="bg-white text-gray-500 text-xs px-3 py-2 rounded-lg shadow-sm">
              Loading conversation...
            </div>
          </div>
        )}

        {/* Welcome message */}
        {!isLoadingHistory && messages.length === 0 && (
          <div className="flex justify-center my-4">
            <div className="bg-[#FCF4CB] text-[#54656F] text-xs px-3 py-2 rounded-lg shadow-sm text-center max-w-[280px]">
              <p className="font-medium">Welcome to Two Seasons Hotel Dubai! 👋</p>
              <p className="mt-1">How can we assist you today?</p>
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, index) => {
          const prevMsg = index > 0 ? messages[index - 1] : null;
          const showDateSeparator = !prevMsg || !isSameDay(msg.timestamp, prevMsg.timestamp);
          return (
            <div key={msg.id}>
              {showDateSeparator && (
                <div className="flex justify-center my-3">
                  <div className="bg-white/90 text-[#54656F] text-[11px] font-medium px-3 py-1.5 rounded-lg shadow-sm">
                    {getDateLabel(msg.timestamp)}
                  </div>
                </div>
              )}
              <WhatsAppMessage
                content={msg.content}
                isUser={msg.isUser}
                isHumanReply={msg.isHumanReply}
                timestamp={msg.timestamp}
                mediaUrl={msg.mediaUrl}
              />
            </div>
          );
        })}

        {/* Typing indicator - only show in AI mode */}
        {isLoading && !isHumanControlled && (
          <div className="flex justify-start mb-2">
            <div className="bg-white rounded-lg rounded-tl-none px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Sending indicator in human mode */}
        {isLoading && isHumanControlled && (
          <div className="flex justify-end mb-2">
            <div className="bg-[#DCF8C6] rounded-lg rounded-tr-none px-3 py-2 shadow-sm flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-gray-500" />
              <span className="text-xs text-gray-500">Sending...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <WhatsAppInput 
        onSend={onSendMessage} 
        disabled={isLoading}
        isHumanMode={isHumanControlled}
      />
    </div>
  );
};

export default WhatsAppChatPanel;
