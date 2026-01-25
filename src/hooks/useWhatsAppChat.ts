import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

// Get or create persistent session ID
const getSessionId = () => {
  const stored = localStorage.getItem('whatsapp_session_id');
  if (stored) return stored;
  const newId = `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem('whatsapp_session_id', newId);
  return newId;
};

export const useWhatsAppChat = () => {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [sessionId] = useState(getSessionId);

  // Load conversation history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('website_chats')
          .select('*')
          .eq('session_id', sessionId)
          .eq('is_archived', false)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error loading chat history:', error);
          return;
        }

        if (data && data.length > 0) {
          const historyMessages: WhatsAppMessage[] = [];
          data.forEach((chat) => {
            if (chat.user_message) {
              historyMessages.push({
                id: `user-${chat.id}`,
                content: chat.user_message,
                isUser: true,
                timestamp: new Date(chat.created_at),
              });
            }
            if (chat.ai_response) {
              historyMessages.push({
                id: `ai-${chat.id}`,
                content: chat.ai_response,
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
  }, [sessionId]);

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
          sessionId,
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
  }, [sessionId]);

  return {
    messages,
    isLoading,
    isLoadingHistory,
    sendMessage,
    sessionId,
  };
};
