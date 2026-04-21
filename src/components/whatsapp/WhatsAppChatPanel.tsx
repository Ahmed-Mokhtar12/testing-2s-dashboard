import { useEffect, useRef } from 'react';
import { Search, MoreVertical, UserCheck, Bot, Loader2 } from 'lucide-react';
import WhatsAppMessage from './WhatsAppMessage';
import WhatsAppInput from './WhatsAppInput';
import { WhatsAppMessage as MessageType } from '@/hooks/useWhatsAppChat';

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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#F0F2F5] border-b border-gray-200">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-10 h-10 bg-[#DFE5E7] rounded-full flex items-center justify-center">
            <svg viewBox="0 0 212 212" className="w-full h-full">
              <path fill="#DFE5E7" d="M106.251.5C164.653.5 212 47.846 212 106.25S164.653 212 106.25 212C47.846 212 .5 164.654.5 106.25S47.846.5 106.251.5z"/>
              <path fill="#FFF" d="M173.561 171.615a62.767 62.767 0 0 0-2.065-2.955 67.7 67.7 0 0 0-2.608-3.299 70.112 70.112 0 0 0-3.184-3.527 71.097 71.097 0 0 0-5.924-5.47 72.458 72.458 0 0 0-10.204-7.026 75.2 75.2 0 0 0-5.98-3.055c-.062-.028-.118-.059-.18-.087-9.792-4.44-22.106-7.529-37.416-7.529s-27.624 3.089-37.416 7.529c-.338.153-.653.318-.985.474a75.37 75.37 0 0 0-6.229 3.298 72.589 72.589 0 0 0-9.15 6.395 71.243 71.243 0 0 0-5.924 5.47 70.064 70.064 0 0 0-3.184 3.527 67.142 67.142 0 0 0-2.609 3.299 63.292 63.292 0 0 0-2.065 2.955 56.33 56.33 0 0 0-1.447 2.324c-.033.056-.073.119-.104.174a47.92 47.92 0 0 0-1.07 1.926c-.559 1.068-.818 1.678-.818 1.678v.398c18.285 17.927 43.322 28.985 70.945 28.985 27.678 0 52.761-11.103 71.055-29.095v-.289s-.619-1.45-1.992-3.778a58.346 58.346 0 0 0-1.446-2.322zM106.002 125.5c2.645 0 5.212-.253 7.68-.737a38.272 38.272 0 0 0 3.624-.896 37.124 37.124 0 0 0 5.12-1.958 36.307 36.307 0 0 0 6.15-3.67 35.923 35.923 0 0 0 9.489-10.48 36.558 36.558 0 0 0 2.422-4.84 37.051 37.051 0 0 0 1.716-5.25c.299-1.208.542-2.443.725-3.701.275-1.887.417-3.827.417-5.811s-.142-3.925-.417-5.811a38.734 38.734 0 0 0-1.215-5.494 36.68 36.68 0 0 0-3.648-8.298 35.923 35.923 0 0 0-9.489-10.48 36.347 36.347 0 0 0-6.15-3.67 37.124 37.124 0 0 0-5.12-1.958 37.67 37.67 0 0 0-3.624-.896 39.875 39.875 0 0 0-7.68-.737c-21.162 0-37.345 16.183-37.345 37.345 0 21.159 16.183 37.342 37.345 37.342z"/>
            </svg>
          </div>
          <div>
            <h2 className="font-medium text-[#111B21]">
              {formatPhoneNumber(senderNumber)}
            </h2>
            {/* Control mode indicator */}
            <div className="flex items-center gap-1 mt-0.5">
              {isHumanControlled ? (
                <>
                  <UserCheck size={10} className="text-orange-500" />
                  <span className="text-[10px] text-orange-500 font-medium">Human Agent Active</span>
                </>
              ) : (
                <>
                  <Bot size={10} className="text-[#128C7E]" />
                  <span className="text-[10px] text-[#128C7E] font-medium">AI Responding</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[#54656F]">
          {/* Takeover / Release button */}
          <button
            onClick={onToggleHumanControl}
            disabled={isTogglingControl}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all shadow-sm ${
              isHumanControlled
                ? 'bg-[#128C7E] text-white hover:bg-[#0e6b5f] border-2 border-[#128C7E] animate-pulse'
                : 'bg-orange-500 text-white hover:bg-orange-600 border-2 border-orange-500'
            } disabled:opacity-60`}
          >
            {isTogglingControl ? (
              <Loader2 size={14} className="animate-spin" />
            ) : isHumanControlled ? (
              <Bot size={14} />
            ) : (
              <UserCheck size={14} />
            )}
            {isTogglingControl
              ? '...'
              : isHumanControlled
              ? 'Release to AI'
              : 'Take Over'}
          </button>

          <Search className="w-5 h-5 cursor-pointer hover:text-[#128C7E]" />
          <MoreVertical className="w-5 h-5 cursor-pointer hover:text-[#128C7E]" />
        </div>
      </div>

      {/* Human control banner */}
      {isHumanControlled && (
        <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <UserCheck size={14} className="text-orange-500 flex-shrink-0" />
            <p className="text-xs text-orange-700 truncate">
              <span className="font-semibold">Human Agent Mode:</span> AI paused. Messages sent directly to customer.
            </p>
          </div>
          <button
            onClick={onToggleHumanControl}
            disabled={isTogglingControl}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#128C7E] text-white hover:bg-[#0e6b5f] transition-all shadow-sm flex-shrink-0 disabled:opacity-60"
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
