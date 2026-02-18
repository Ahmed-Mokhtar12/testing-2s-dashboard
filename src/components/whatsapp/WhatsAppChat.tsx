import React, { useState, useEffect } from 'react';
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

  // Load all chat previews
  useEffect(() => {
    const loadChatPreviews = async () => {
      setIsLoadingChats(true);
      try {
        // Get distinct sender numbers with their latest message
        const { data, error } = await supabase
          .from('Chat History')
          .select('*')
          .eq('is_archived', false)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error loading chats:', error);
          return;
        }

        // Group by sender number and get latest message
        const chatMap = new Map<string, ChatPreview>();
        
        data?.forEach((chat) => {
          const num = chat['Sender Number'];
          if (num && !chatMap.has(num)) {
            const date = new Date(chat.created_at);
            const now = new Date();
            const isToday = date.toDateString() === now.toDateString();
            const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString();
            
            let timestamp: string;
            if (isToday) {
              timestamp = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            } else if (isYesterday) {
              timestamp = 'Yesterday';
            } else {
              timestamp = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            }

            chatMap.set(num, {
              senderNumber: num,
              name: chat['Name'] || undefined,
              lastMessage: chat['Ai Reply'] || chat['Sender Message'] || '',
              timestamp,
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
  }, []);

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
