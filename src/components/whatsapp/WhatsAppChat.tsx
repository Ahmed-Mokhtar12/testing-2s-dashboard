import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import WhatsAppNavRail from './WhatsAppNavRail';
import WhatsAppSidebar from './WhatsAppSidebar';
import WhatsAppChatPanel from './WhatsAppChatPanel';
import WhatsAppMobileSidebar from './WhatsAppMobileSidebar';
import WhatsAppMobileTabBar from './WhatsAppMobileTabBar';
import { useWhatsAppChat } from '@/hooks/useWhatsAppChat';
import { useIsMobile } from '@/hooks/use-mobile';
import { hasMediaContent } from '@/lib/whatsappMedia';
import type { ChatPreview } from '@/lib/whatsappUi';

const WhatsAppChat: React.FC = () => {
  const [chatPreviews, setChatPreviews] = useState<ChatPreview[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
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
    isHumanControlled,
    isTogglingControl,
    toggleHumanControl,
  } = useWhatsAppChat();

  const buildTimestamp = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isToday) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (isYesterday) return 'Yesterday';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }, []);

  useEffect(() => {
    const loadChatPreviews = async () => {
      setIsLoadingChats(true);
      try {
        const { data, error } = await supabase
          .from('Chat History')
          .select('*')
          .eq('is_archived', false)
          .order('created_at', { ascending: false });

        if (error) {
          if (import.meta.env.DEV) console.error('Error loading chats:', error);
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
              timestamp: buildTimestamp(chat.created_at),
            });
          }
        });
        setChatPreviews(Array.from(chatMap.values()));
      } catch (err) {
        if (import.meta.env.DEV) console.error('Failed to load chat previews:', err);
      } finally {
        setIsLoadingChats(false);
      }
    };
    loadChatPreviews();
  }, [buildTimestamp]);

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
          const timestamp = buildTimestamp(chat['created_at'] as string);

          setChatPreviews((prev) => {
            const exists = prev.find((p) => p.senderNumber === num);
            if (exists) {
              return [
                { ...exists, lastMessage, timestamp },
                ...prev.filter((p) => p.senderNumber !== num),
              ];
            }
            return [
              {
                senderNumber: num,
                name: (chat['Name'] as string) || undefined,
                lastMessage,
                timestamp,
              },
              ...prev,
            ];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [buildTimestamp]);

  if (isMobile) {
    const handleSelectMobile = (num: string) => {
      changeSenderNumber(num);
      setMobileView('chat');
    };

    return (
      <div data-testid="whatsapp-chat-shell" className="flex flex-col h-full w-full bg-white overflow-hidden">
        {mobileView === 'chat' ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <WhatsAppChatPanel
              messages={messages}
              senderNumber={senderNumber}
              guestName={chatPreviews.find((c) => c.senderNumber === senderNumber)?.name}
              isLoading={isLoading}
              isLoadingHistory={isLoadingHistory}
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
              />
            </div>
            <WhatsAppMobileTabBar active="chats" />
          </>
        )}
      </div>
    );
  }

  return (
    <div data-testid="whatsapp-chat-shell" className="flex h-full w-full bg-[#111B21] overflow-hidden">
      <WhatsAppNavRail />

      <div className="w-[30%] min-w-[300px] max-w-[500px] h-full shrink-0">
        <WhatsAppSidebar
          chats={chatPreviews}
          selectedNumber={senderNumber}
          onSelectChat={changeSenderNumber}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isLoading={isLoadingChats}
        />
      </div>

      <div className="flex-1 min-w-0 h-full">
        <WhatsAppChatPanel
          messages={messages}
          senderNumber={senderNumber}
          guestName={chatPreviews.find((c) => c.senderNumber === senderNumber)?.name}
          isLoading={isLoading}
          isLoadingHistory={isLoadingHistory}
          isHumanControlled={isHumanControlled}
          isTogglingControl={isTogglingControl}
          onSendMessage={sendMessage}
          onToggleHumanControl={toggleHumanControl}
        />
      </div>
    </div>
  );
};

export default WhatsAppChat;
