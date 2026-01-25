import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

// Get or create persistent sender number
const getSenderNumber = () => {
  const stored = localStorage.getItem('whatsapp_sender_number');
  if (stored) return stored;
  const newId = `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem('whatsapp_sender_number', newId);
  return newId;
};

export const useWhatsAppChat = () => {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [senderNumber] = useState(getSenderNumber);

  // Load conversation history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('Chat History')
          .select('*')
          .eq('Sender Number', senderNumber)
          .eq('is_archived', false)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error loading chat history:', error);
          return;
        }

        if (data && data.length > 0) {
          const historyMessages: WhatsAppMessage[] = [];
          data.forEach((chat) => {
            if (chat['Sender Message']) {
              historyMessages.push({
                id: `user-${chat.id}`,
                content: chat['Sender Message'],
                isUser: true,
                timestamp: new Date(chat.created_at),
              });
            }
            if (chat['Ai Reply']) {
              historyMessages.push({
                id: `ai-${chat.id}`,
                content: chat['Ai Reply'],
                isUser: false,
                timestamp: new Date(chat.created_at),
              });
            }
          });
          setMessages(historyMessages);
        }
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [senderNumber]);

  const sendMessage = useCallback(async (content: string) => {
    // Add user message immediately
    const userMessage: WhatsAppMessage = {
      id: `user-${Date.now()}`,
      content,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-web-chat', {
        body: {
          message: content,
          senderNumber,
        },
      });

      if (error) {
        throw error;
      }

      // Add AI response
      const aiMessage: WhatsAppMessage = {
        id: `ai-${Date.now()}`,
        content: data?.response || 'Sorry, I could not process your request.',
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add error message
      const errorMessage: WhatsAppMessage = {
        id: `error-${Date.now()}`,
        content: 'Sorry, there was an error processing your message. Please try again.',
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [senderNumber]);

  return {
    messages,
    isLoading,
    isLoadingHistory,
    sendMessage,
    senderNumber,
  };
};
