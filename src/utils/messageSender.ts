import { supabase } from '@/integrations/supabase/client';
import { Message } from '@/types/chat';
import { getErrorMessage } from '@/utils/errorUtils';

export const createUserMessage = (content: string): Message => ({
  id: crypto.randomUUID(),
  content,
  isUser: true,
  timestamp: new Date(),
});

export const createAIMessage = (content: string): Message => ({
  id: crypto.randomUUID(),
  content,
  isUser: false,
  timestamp: new Date(),
});

export const createErrorMessage = (customMessage?: string): Message => ({
  id: crypto.randomUUID(),
  content: customMessage || "I'm unable to answer based on the current data. Please try again.",
  isUser: false,
  timestamp: new Date(),
});

export const sendMessageToAI = async (message: string, messageId: string) => {
  const { data, error } = await supabase.functions.invoke('chat-with-data', {
    body: {
      message,
      messageId,
    },
  });

  if (error) {
    throw error;
  }

  return data;
};

export const executeAction = async (
  actionData: import('@/types/chat').ActionData,
  messageId: string
) => {
  try {
    const { data, error } = await supabase.functions.invoke('execute-n8n-action', {
      body: {
        ...actionData,
        messageId,
      },
    });

    if (error) {
      if (import.meta.env.DEV) console.error('Supabase functions.invoke error:', error);

      let enhancedError = new Error(error.message || 'Unknown error occurred');

      if (error.message?.includes('fetch')) {
        enhancedError = new Error(
          'Network error: Could not connect to the action service. Please check your internet connection and try again.'
        );
      } else if (error.message?.includes('timeout')) {
        enhancedError = new Error(
          'Request timeout: The action service is taking too long to respond. Please try again.'
        );
      } else if (error.message?.includes('404')) {
        enhancedError = new Error(
          'Service unavailable: The action service endpoint was not found. Please contact support.'
        );
      } else if (error.message?.includes('500')) {
        enhancedError = new Error(
          'Server error: The action service encountered an internal error. Please try again later.'
        );
      }

      throw enhancedError;
    }

    if (!data) {
      throw new Error('No response received from action service');
    }

    if (!data.success) {
      throw new Error(data.error || 'Action execution failed');
    }

    return data;
  } catch (networkError) {
    if (import.meta.env.DEV) console.error('Network/client error in executeAction:', networkError);

    if (networkError instanceof TypeError && networkError.message.includes('fetch')) {
      throw new Error(
        'Unable to connect to the action service. Please check your internet connection and try again.'
      );
    }

    throw new Error(`Action execution failed: ${getErrorMessage(networkError)}`);
  }
};
