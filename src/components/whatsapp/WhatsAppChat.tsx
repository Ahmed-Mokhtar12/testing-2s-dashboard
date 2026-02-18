import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import WhatsAppSidebar from './WhatsAppSidebar';
import WhatsAppChatPanel from './WhatsAppChatPanel';
import { useWhatsAppChat, WhatsAppMessage } from '@/hooks/useWhatsAppChat';

interface ChatPreview {
  senderNumber: string;
  name?: string;
  lastMessage: string;
  timestamp: string;
  unreadCount?: number;
}

const WhatsAppChat: React.FC = () => {
  const [chatPreviews, setChatPreviews] = useState<ChatPreview[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Load all chat previews
  useEffect(() => {
    const loadChatPreviews = async () => {
      setIsLoadingChats(true);
      try {
        const { data, error } = await supabase
          .from('Chat History')
          .select('*')
          .eq('is_archived', false)
          .order('created_at', { ascending: false });

        if (error) { console.error('Error loading chats:', error); return; }

        const chatMap = new Map<string, ChatPreview>();
        data?.forEach((chat) => {
          const num = chat['Sender Number'];
          if (num && !chatMap.has(num)) {
            chatMap.set(num, {
              senderNumber: num,
              name: chat['Name'] || undefined,
              lastMessage: chat['Ai Reply'] || chat['Sender Message'] || '',
              timestamp: buildTimestamp(chat.created_at),
            });
          }
        });
        setChatPreviews(Array.from(chatMap.values()));
      } catch (err) {
        console.error('Failed to load chat previews:', err);
      } finally {
        setIsLoadingChats(false);
      }
    };
    loadChatPreviews();
  }, [buildTimestamp]);

  // Realtime: update sidebar when any new message arrives
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

          const lastMessage =
            (chat['Ai Reply'] as string) ||
            (chat['Sender Message'] as string) ||
            '';
          const timestamp = buildTimestamp(chat['created_at'] as string);

          setChatPreviews((prev) => {
            const exists = prev.find((p) => p.senderNumber === num);
            if (exists) {
              // Move to top and update last message
              return [
                { ...exists, lastMessage, timestamp },
                ...prev.filter((p) => p.senderNumber !== num),
              ];
            }
            // New conversation
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

    return () => { supabase.removeChannel(channel); };
  }, [buildTimestamp]);

  return (
    <div className="flex h-full w-full bg-[#111B21]">
      {/* Sidebar */}
      <div className="w-[30%] min-w-[300px] max-w-[500px] h-full">
        <WhatsAppSidebar
          chats={chatPreviews}
          selectedNumber={senderNumber}
          onSelectChat={changeSenderNumber}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isLoading={isLoadingChats}
        />
      </div>

      {/* Chat Panel */}
      <div className="flex-1 h-full">
        <WhatsAppChatPanel
          messages={messages}
          senderNumber={senderNumber}
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
