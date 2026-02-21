
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

export const createErrorMessage = (customMessage?: string): Message => ({
  id: (Date.now() + 1).toString(),
  content: customMessage || "I'm unable to answer based on the current data. Please try again.",
  isUser: false,
  timestamp: new Date(),
});

export const sendMessageToAI = async (message: string, messageId: string, sessionId?: string) => {
  console.log('Sending message to Supabase edge function:', message, 'sessionId:', sessionId);
  
  const { data, error } = await supabase.functions.invoke('chat-with-data', {
    body: {
      message,
      messageId,
      sessionId
    }
  });

  if (error) {
    throw error;
  }

  console.log('Received response from edge function:', data);
  
  return data;
};

export const executeAction = async (actionData: any, messageId: string) => {
  console.log('🚀 Executing action via Supabase edge function:', actionData);
  console.log('🔧 Message ID:', messageId);
  console.log('🔧 Supabase client configured:', !!supabase);
  
  try {
    const { data, error } = await supabase.functions.invoke('execute-n8n-action', {
      body: {
        ...actionData,
        messageId
      }
    });

    console.log('📤 Supabase functions.invoke response - data:', data);
    console.log('📤 Supabase functions.invoke response - error:', error);

    if (error) {
      console.error('❌ Supabase functions.invoke error:', error);
      
      // Enhanced error handling with specific guidance
      let enhancedError = new Error(error.message || 'Unknown error occurred');
      
      if (error.message?.includes('fetch')) {
        enhancedError = new Error('Network error: Could not connect to the action service. Please check your internet connection and try again.');
      } else if (error.message?.includes('timeout')) {
        enhancedError = new Error('Request timeout: The action service is taking too long to respond. Please try again.');
      } else if (error.message?.includes('404')) {
        enhancedError = new Error('Service unavailable: The action service endpoint was not found. Please contact support.');
      } else if (error.message?.includes('500')) {
        enhancedError = new Error('Server error: The action service encountered an internal error. Please try again later.');
      }
      
      throw enhancedError;
    }

    if (!data) {
      throw new Error('No response received from action service');
    }

    if (!data.success) {
      throw new Error(data.error || 'Action execution failed');
    }

    console.log('✅ Action execution successful:', data);
    return data;
    
  } catch (networkError) {
    console.error('🚨 Network/Client error in executeAction:', networkError);
    
    // Handle client-side network errors
    if (networkError.name === 'TypeError' && networkError.message.includes('fetch')) {
      throw new Error('Unable to connect to the action service. Please check your internet connection and try again.');
    }
    
    // Re-throw the error with additional context
    throw new Error(`Action execution failed: ${networkError.message}`);
  }
};
