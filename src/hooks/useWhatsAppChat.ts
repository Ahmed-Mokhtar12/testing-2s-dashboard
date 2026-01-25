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
  // Default to first known number - user can change later
  return '971505913426';
};

const saveSenderNumber = (number: string) => {
  localStorage.setItem('whatsapp_sender_number', number);
};

export const useWhatsAppChat = () => {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [senderNumber, setSenderNumber] = useState(getSenderNumber);
  const [availableNumbers, setAvailableNumbers] = useState<string[]>([]);

  // Load available sender numbers
  useEffect(() => {
    const loadNumbers = async () => {
      const { data, error } = await supabase
        .from('Chat History')
        .select('"Sender Number"')
        .not('Sender Number', 'is', null);
      
      if (data && !error) {
        const uniqueNumbers = [...new Set(data.map(d => d['Sender Number']).filter(Boolean))] as string[];
        setAvailableNumbers(uniqueNumbers);
      }
    };
    loadNumbers();
  }, []);

  // Load conversation history on mount or when sender changes
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoadingHistory(true);
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
        } else {
          setMessages([]);
        }
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [senderNumber]);

  const changeSenderNumber = useCallback((number: string) => {
    saveSenderNumber(number);
    setSenderNumber(number);
  }, []);

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
    availableNumbers,
    changeSenderNumber,
  };
};
