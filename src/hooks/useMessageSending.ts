import { useToast } from '@/hooks/use-toast';
import { Message } from '@/types/chat';
import { 
  createUserMessage, 
  createAIMessage, 
  createErrorMessage, 
  sendMessageToAI 
} from '@/utils/messageSender';

interface UseMessageSendingProps {
  onSaveChatMessage?: (userMessage: string, aiReply: string, sessionId?: string) => Promise<void>;
  activeSessionId?: string | null;
  createNewSessionId?: () => string;
}

export const useMessageSending = ({ 
  onSaveChatMessage, 
  activeSessionId, 
  createNewSessionId 
}: UseMessageSendingProps = {}) => {
  const { toast } = useToast();

  const handleSendMessage = async (
    inputValue: string,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    setInputValue: React.Dispatch<React.SetStateAction<string>>,
    setIsTyping: React.Dispatch<React.SetStateAction<boolean>>,
    currentSessionId: string | null,
    setCurrentSessionId: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    if (!inputValue.trim()) return;

    const userMessage = createUserMessage(inputValue);
    const userMessageContent = inputValue;
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Create session ID if this is the first message
    let sessionId = currentSessionId || activeSessionId;
    if (!sessionId && createNewSessionId) {
      sessionId = createNewSessionId();
      setCurrentSessionId(sessionId);
    }

    try {
      const aiResponseData = await sendMessageToAI(userMessageContent, userMessage.id);
      
      // Handle both old string responses and new structured responses
      let aiMessage;
      if (typeof aiResponseData === 'string') {
        aiMessage = createAIMessage(aiResponseData);
      } else {
        aiMessage = createAIMessage(aiResponseData.response || "I'm here to help!");
        
        // Ignore disabled send-action payloads so the chat always shows a text reply.
        if (
          aiResponseData.hasAction &&
          aiResponseData.actionData &&
          aiResponseData.actionData.type === 'sms'
        ) {
          aiMessage = {
            ...aiMessage,
            hasAction: true,
            actionData: aiResponseData.actionData,
            actionStatus: aiResponseData.actionStatus || 'pending_confirmation'
          };
        }
      }
      
      setMessages(prev => [...prev, aiMessage]);
      
      // Save chat message if callback is provided
      if (onSaveChatMessage) {
        const aiReply = typeof aiResponseData === 'string' ? aiResponseData : aiResponseData.response;
        // Ensure we save the actual text content, not any wrapper objects
        const cleanUserMessage = typeof userMessageContent === 'string' ? userMessageContent : 
                                typeof userMessageContent === 'object' && userMessageContent && 'body' in userMessageContent ? 
                                (userMessageContent as any).body : JSON.stringify(userMessageContent);
        await onSaveChatMessage(cleanUserMessage, aiReply || '', sessionId || undefined);
      }
      
    } catch (error) {
      console.error('Error calling edge function:', error);
      
      let userFriendlyMessage = "I'm unable to answer based on the current data. Please try again.";
      let toastTitle = "Connection Error";
      let toastDescription = "Failed to connect to the AI service. Please try again.";
      
      if (error.message?.includes('rate limit')) {
        userFriendlyMessage = "I'm experiencing high demand right now. Please try again in a moment.";
        toastTitle = "High Demand";
        toastDescription = "The AI service is busy. Please wait a moment and try again.";
      } else if (error.message?.includes('timeout')) {
        userFriendlyMessage = "The response is taking longer than expected. Please try asking a simpler question.";
        toastTitle = "Timeout";
        toastDescription = "Your request timed out. Try asking a shorter question.";
      } else if (error.message?.includes('trouble')) {
        userFriendlyMessage = error.message;
        toastTitle = "Service Issue";
        toastDescription = "There's a temporary issue with the AI service.";
      }
      
      const errorMessage = createErrorMessage(userFriendlyMessage);
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: toastTitle,
        description: toastDescription,
        variant: "destructive",
      });
    } finally {
      setIsTyping(false);
    }
  };

  return { handleSendMessage };
};