import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

export const useWhatsAppChat = () => {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

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
    sendMessage,
    sessionId,
  };
};
