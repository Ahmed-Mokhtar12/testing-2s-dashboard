import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Search, MoreVertical, UserCheck, Bot, Loader2, ArrowLeft, ChevronDown, ChevronUp, X } from 'lucide-react';
import WhatsAppMessage from './WhatsAppMessage';
import WhatsAppInput from './WhatsAppInput';
import { WhatsAppMessage as MessageType } from '@/hooks/useWhatsAppChat';
import type { UploadedAttachment } from '@/hooks/useWhatsAppAttachment';
import { formatPhoneNumber, getAvatarColor, getInitials } from '@/lib/whatsappUi';

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
  guestName?: string;
  isLoading: boolean;
  isLoadingHistory: boolean;
  hasMoreHistory?: boolean;
  isLoadingOlder?: boolean;
  onLoadOlder?: () => void;
  isHumanControlled: boolean;
  isTogglingControl: boolean;
  onSendMessage: (message: string, attachment?: UploadedAttachment) => void;
  onToggleHumanControl: () => void;
  onBack?: () => void;
}

const WhatsAppChatPanel: React.FC<WhatsAppChatPanelProps> = ({
  messages,
  senderNumber,
  guestName,
  isLoading,
  isLoadingHistory,
  hasMoreHistory,
  isLoadingOlder,
  onLoadOlder,
  isHumanControlled,
  isTogglingControl,
  onSendMessage,
  onToggleHumanControl,
  onBack,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Follow the conversation only while the operator is already near the bottom;
  // never yank someone who scrolled up to read history.
  const isNearBottomRef = useRef(true);

  const [showFab, setShowFab] = useState(false);
  const [fabCount, setFabCount] = useState(0);
  const prevLenRef = useRef(0);
  // Set before onLoadOlder; consumed by the layout effect to keep the viewport
  // anchored on the same message after older pages are prepended.
  const pendingRestoreRef = useRef<{ h: number; t: number } | null>(null);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    isNearBottomRef.current = nearBottom;
    setShowFab(!nearBottom);
    if (nearBottom) setFabCount(0);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    isNearBottomRef.current = true;
    setShowFab(false);
    setFabCount(0);
    prevLenRef.current = 0;
  }, [senderNumber]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (pendingRestoreRef.current && el) {
      el.scrollTop = el.scrollHeight - pendingRestoreRef.current.h + pendingRestoreRef.current.t;
      pendingRestoreRef.current = null;
    } else if (isNearBottomRef.current) {
      scrollToBottom();
    } else if (messages.length > prevLenRef.current && prevLenRef.current > 0) {
      setFabCount((c) => c + (messages.length - prevLenRef.current));
    }
    prevLenRef.current = messages.length;
  }, [messages]);

  const handleSend: WhatsAppChatPanelProps['onSendMessage'] = (message, attachment) => {
    onSendMessage(message, attachment);
    isNearBottomRef.current = true;
    setShowFab(false);
    setFabCount(0);
    requestAnimationFrame(scrollToBottom);
  };

  const handleLoadOlder = () => {
    const el = containerRef.current;
    if (el) pendingRestoreRef.current = { h: el.scrollHeight, t: el.scrollTop };
    onLoadOlder?.();
  };

  // In-chat search over LOADED messages (server-wide search is Phase 3).
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);

  const matchIds = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [] as string[];
    return messages.filter((m) => m.content.toLowerCase().includes(term)).map((m) => m.id);
  }, [messages, searchTerm]);

  // A new term jumps to the newest match, like WhatsApp.
  useEffect(() => {
    setActiveMatch(matchIds.length ? matchIds.length - 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  useEffect(() => {
    const id = matchIds[activeMatch];
    if (!id) return;
    const el = containerRef.current?.querySelector(`[data-msg-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: 'center' });
    setFlashId(id);
    const t = setTimeout(() => setFlashId(null), 1200);
    return () => clearTimeout(t);
  }, [activeMatch, matchIds]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchTerm('');
  };

  const stepMatch = (dir: -1 | 1) => {
    if (!matchIds.length) return;
    setActiveMatch((i) => (i + dir + matchIds.length) % matchIds.length);
  };

  const initials = getInitials(guestName, senderNumber);

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#F0F2F5] border-b border-gray-200 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1 -ml-1 text-[#008069] hover:bg-black/5 rounded-full shrink-0"
              aria-label="Back"
            >
              <ArrowLeft size={22} />
            </button>
          )}
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
              {guestName || formatPhoneNumber(senderNumber)}
            </h2>
            <p className="text-[11px] text-[#667781] truncate">
              {guestName ? `${formatPhoneNumber(senderNumber)} · ` : ''}
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

          <button
            type="button"
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            aria-label="Search in conversation"
            className={`shrink-0 ${searchOpen ? 'text-[#008069]' : 'hover:text-[#008069]'}`}
          >
            <Search className="w-5 h-5" />
          </button>
          <MoreVertical className="w-5 h-5 cursor-pointer hover:text-[#008069] shrink-0" />
        </div>
      </div>


      {/* In-chat search bar */}
      {searchOpen && (
        <div className="bg-white border-b border-gray-200 px-3 py-2">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              dir="auto"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  stepMatch(-1);
                } else if (e.key === 'Escape') {
                  closeSearch();
                }
              }}
              placeholder="Search loaded messages"
              className="flex-1 bg-[#F0F2F5] rounded-lg px-3 py-1.5 text-sm text-[#111B21] placeholder:text-[#667781] focus:outline-none"
            />
            <span className="text-xs text-[#667781] whitespace-nowrap tabular-nums">
              {matchIds.length ? `${activeMatch + 1}/${matchIds.length}` : '0/0'}
            </span>
            <button type="button" onClick={() => stepMatch(-1)} aria-label="Previous match" className="text-[#54656F] hover:text-[#008069] disabled:opacity-40" disabled={!matchIds.length}>
              <ChevronUp size={18} />
            </button>
            <button type="button" onClick={() => stepMatch(1)} aria-label="Next match" className="text-[#54656F] hover:text-[#008069] disabled:opacity-40" disabled={!matchIds.length}>
              <ChevronDown size={18} />
            </button>
            <button type="button" onClick={closeSearch} aria-label="Close search" className="text-[#54656F] hover:text-[#008069]">
              <X size={18} />
            </button>
          </div>
          {hasMoreHistory && searchTerm.trim() && (
            <p className="text-[10px] text-[#667781] mt-1">
              Searching loaded messages only — load earlier messages to search further back.
            </p>
          )}
        </div>
      )}

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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#008069] text-white hover:bg-[#017561] transition-all shadow-sm shrink-0 disabled:opacity-60 whitespace-nowrap"
          >
            {isTogglingControl ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
            Release to AI
          </button>
        </div>
      )}

      {/* Chat area */}
      <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 sm:px-8 lg:px-16 py-2"
        style={{
          backgroundColor: '#EFEAE2',
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23C7BBA9' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {/* Earlier pages exist beyond the newest PAGE_SIZE rows */}
        {!isLoadingHistory && hasMoreHistory && (
          <div className="flex justify-center my-2">
            <button
              type="button"
              onClick={handleLoadOlder}
              disabled={isLoadingOlder}
              className="bg-white text-[#008069] text-xs font-medium px-3 py-1.5 rounded-full shadow-sm hover:bg-[#F0F2F5] transition-colors disabled:opacity-60"
            >
              {isLoadingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}

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
          const provenance = (m: MessageType) => (m.isUser ? 'guest' : m.isHumanReply ? 'human' : 'ai');
          const isFirstOfGroup =
            !prevMsg || showDateSeparator || provenance(prevMsg) !== provenance(msg);
          return (
            <div
              key={msg.id}
              data-msg-id={msg.id}
              className={`rounded-lg transition-colors duration-500 ${flashId === msg.id ? 'bg-black/10' : ''}`}
            >
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
                attachment={msg.attachment}
                repliedByName={msg.repliedByName}
                isFirstOfGroup={isFirstOfGroup}
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
            <div className="bg-[#D9FDD3] rounded-lg rounded-tr-none px-3 py-2 shadow-sm flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-gray-500" />
              <span className="text-xs text-gray-500">Sending...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll-to-bottom FAB with new-message count while scrolled up */}
      {showFab && (
        <button
          type="button"
          onClick={() => {
            setFabCount(0);
            isNearBottomRef.current = true;
            setShowFab(false);
            scrollToBottom();
          }}
          aria-label="Scroll to latest messages"
          className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center text-[#54656F] hover:bg-[#F0F2F5] transition-colors"
        >
          <ChevronDown size={22} />
          {fabCount > 0 && (
            <span className="absolute -top-1.5 -right-1 bg-[#25D366] text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
              {fabCount}
            </span>
          )}
        </button>
      )}
      </div>

      {/* Input area — keyed by conversation so text + staged files never leak
          into another guest's composer (mis-send hazard). In-flight sends still
          deliver to the chat they were typed in: the submit closure captured the
          old onSend, whose sendMessage closure captured the old senderNumber. */}
      <WhatsAppInput
        key={senderNumber}
        onSend={handleSend}
        disabled={isLoading}
        isHumanMode={isHumanControlled}
        senderNumber={senderNumber}
      />
    </div>
  );
};

export default WhatsAppChatPanel;
