
import { supabase } from '@/integrations/supabase/client';
import { Message } from '@/types/chat';

export const createUserMessage = (content: string): Message => ({
  id: Date.now().toString(),
  content,
  isUser: true,
  timestamp: new Date(),
});

export const createAIMessage = (content: string): Message => ({
  id: (Date.now() + 1).toString(),
  content,
  isUser: false,
  timestamp: new Date(),
});

export const createErrorMessage = (): Message => ({
  id: (Date.now() + 1).toString(),
  content: "I'm unable to answer based on the current data. Please try again.",
  isUser: false,
  timestamp: new Date(),
});

export const sendMessageToAI = async (message: string, messageId: string) => {
  console.log('Sending message to Supabase edge function:', message);
  
  const { data, error } = await supabase.functions.invoke('chat-with-data', {
    body: {
      message,
      messageId
    }
  });

  if (error) {
    throw error;
  }

  console.log('Received response from edge function:', data);
  
  return data.response || "I'm unable to answer based on the current data.";
};
