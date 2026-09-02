import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import WhatsAppNavRail from './WhatsAppNavRail';
import WhatsAppSidebar from './WhatsAppSidebar';
import WhatsAppChatPanel from './WhatsAppChatPanel';
import WhatsAppMobileSidebar from './WhatsAppMobileSidebar';
import WhatsAppEmptyState from './WhatsAppEmptyState';
import WhatsAppMobileTabBar from './WhatsAppMobileTabBar';
import { useWhatsAppChat } from '@/hooks/useWhatsAppChat';
import { useIsMobile } from '@/hooks/use-mobile';
import { hasMediaContent } from '@/lib/whatsappMedia';
import type { ChatPreview } from '@/lib/whatsappUi';

const WhatsAppChat: React.FC = () => {
  const [chatPreviews, setChatPreviews] = useState<ChatPreview[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [realtimeDown, setRealtimeDown] = useState(false);
  const refetchTimerRef = useRef<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const isMobile = useIsMobile();

  const {
    messages,
    isLoading,
    isLoadingHistory,
    sendMessage,
    senderNumber,
    changeSenderNumber,
    hasMoreHistory,
    isLoadingOlder,
    loadOlderMessages,
    isHumanControlled,
    isTogglingControl,
    toggleHumanControl,
  } = useWhatsAppChat();

  // Re-render every minute so render-time timestamp labels ("14:05" →
  // "Yesterday") stay current without refetching.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setClockTick((t) => t + 1), 60_000);
    // Cross-tab draft changes arrive as storage events; a tick re-renders the
    // sidebar previews (same-tab drafts surface on the chat switch itself).
    const onStorage = () => setClockTick((t) => t + 1);
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const loadChatPreviews = useCallback(async () => {
      setIsLoadingChats(true);
      setLoadError(false);
      try {
        // Named columns (exactly what the preview builder below reads) and an
        // explicit cap: PostgREST clamps every response to 1000 rows anyway,
        // so the limit makes today's window deterministic (id tiebreak) rather
        // than changing behaviour. Realtime INSERTs are merged into state in
        // place, so a capped initial read does not affect liveness.
        const { data, error } = await supabase
          .from('Chat History')
          .select('id, created_at, Name, human_reply, Media, "Sender Number", "Ai Reply", "Sender Message"')
          .eq('is_archived', false)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(1000);

        if (error) {
          if (import.meta.env.DEV) console.error('Error loading chats:', error);
          setLoadError(true);
          return;
        }

        const chatMap = new Map<string, ChatPreview>();
        data?.forEach((chat) => {
          const num = chat['Sender Number'];
          // Newest-writer-first preview: an operator reply must show, not a
          // blank line; media-only rows get a glyph instead of disappearing.
          const textPreview =
            chat['human_reply'] || chat['Ai Reply'] || chat['Sender Message'] || '';
          const hasContent = textPreview || hasMediaContent(chat['Media']);
          if (num && hasContent && !chatMap.has(num)) {
            chatMap.set(num, {
              senderNumber: num,
              name: chat['Name'] || undefined,
              lastMessage: textPreview || '📎 Attachment',
              lastActivityAt: chat.created_at,
            });
          }
        });
        setChatPreviews(Array.from(chatMap.values()));
      } catch (err) {
        if (import.meta.env.DEV) console.error('Failed to load chat previews:', err);
        setLoadError(true);
      } finally {
        setIsLoadingChats(false);
      }
  }, []);

  useEffect(() => {
    loadChatPreviews();
  }, [loadChatPreviews]);

  // Coalesce burst refetches (auto-release bulk-updates every row of a sender;
  // REPLICA IDENTITY FULL makes each event carry the whole old row).
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current !== null) return;
    refetchTimerRef.current = window.setTimeout(() => {
      refetchTimerRef.current = null;
      loadChatPreviews();
    }, 800);
  }, [loadChatPreviews]);

  useEffect(() => {
    return () => {
      if (refetchTimerRef.current !== null) window.clearTimeout(refetchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-sidebar-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Chat History' },
        (payload) => {
          const chat = payload.new as Record<string, unknown>;
          const num = chat['Sender Number'] as string | undefined;
          if (!num) return;

          const textPreview =
            (chat['human_reply'] as string) ||
            (chat['Ai Reply'] as string) ||
            (chat['Sender Message'] as string) ||
            '';
          if (!textPreview && !hasMediaContent(chat['Media'])) return;

          const lastMessage = textPreview || '📎 Attachment';
          const lastActivityAt = chat['created_at'] as string;

          setChatPreviews((prev) => {
            const exists = prev.find((p) => p.senderNumber === num);
            if (exists) {
              return [
                { ...exists, lastMessage, lastActivityAt },
                ...prev.filter((p) => p.senderNumber !== num),
              ];
            }
            return [
              {
                senderNumber: num,
                name: (chat['Name'] as string) || undefined,
                lastMessage,
                lastActivityAt,
              },
              ...prev,
            ];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'Chat History' },
        (payload) => {
          // React ONLY to column transitions that affect the list; never
          // reorder on UPDATE (updates are not new messages).
          const oldRow = payload.old as Record<string, unknown>;
          const newRow = payload.new as Record<string, unknown>;
          if (oldRow['is_archived'] !== newRow['is_archived']) scheduleRefetch();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeDown(false);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeDown(true);
          scheduleRefetch();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scheduleRefetch]);

  if (isMobile) {
    const handleSelectMobile = (num: string) => {
      changeSenderNumber(num);
      setMobileView('chat');
    };

    return (
      <main data-testid="whatsapp-chat-shell" className="flex flex-col h-full w-full bg-white overflow-hidden">
        {mobileView === 'chat' ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* List view has a visible h1 in WhatsAppMobileSidebar; the chat
                view otherwise has only the guest-name h2. */}
            <h1 className="sr-only">WhatsApp conversations</h1>
            <WhatsAppChatPanel
              messages={messages}
              senderNumber={senderNumber}
              guestName={chatPreviews.find((c) => c.senderNumber === senderNumber)?.name}
              isLoading={isLoading}
              isLoadingHistory={isLoadingHistory}
              hasMoreHistory={hasMoreHistory}
              isLoadingOlder={isLoadingOlder}
              onLoadOlder={loadOlderMessages}
              isHumanControlled={isHumanControlled}
              isTogglingControl={isTogglingControl}
              onSendMessage={sendMessage}
              onToggleHumanControl={toggleHumanControl}
              onBack={() => setMobileView('list')}
            />
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0">
              <WhatsAppMobileSidebar
                chats={chatPreviews}
                selectedNumber={senderNumber}
                onSelectChat={handleSelectMobile}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                isLoading={isLoadingChats}
                loadError={loadError}
                onRetry={loadChatPreviews}
                connectionDown={realtimeDown}
              />
            </div>
            <WhatsAppMobileTabBar active="chats" />
          </>
        )}
      </main>
    );
  }

  return (
    <main data-testid="whatsapp-chat-shell" className="flex h-full w-full bg-[#111B21] overflow-hidden">
      <h1 className="sr-only">WhatsApp conversations</h1>
      <WhatsAppNavRail />

      <div className="w-[30%] min-w-[300px] max-w-[500px] h-full shrink-0">
        <WhatsAppSidebar
          chats={chatPreviews}
          selectedNumber={senderNumber}
          onSelectChat={changeSenderNumber}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isLoading={isLoadingChats}
          loadError={loadError}
          onRetry={loadChatPreviews}
          connectionDown={realtimeDown}
        />
      </div>

      <div className="flex-1 min-w-0 h-full">
        {!senderNumber ? (
          <WhatsAppEmptyState />
        ) : (
        <WhatsAppChatPanel
          messages={messages}
          senderNumber={senderNumber}
          guestName={chatPreviews.find((c) => c.senderNumber === senderNumber)?.name}
          isLoading={isLoading}
          isLoadingHistory={isLoadingHistory}
          hasMoreHistory={hasMoreHistory}
          isLoadingOlder={isLoadingOlder}
          onLoadOlder={loadOlderMessages}
          isHumanControlled={isHumanControlled}
          isTogglingControl={isTogglingControl}
          onSendMessage={sendMessage}
          onToggleHumanControl={toggleHumanControl}
        />
        )}
      </div>
    </main>
  );
};

export default WhatsAppChat;
