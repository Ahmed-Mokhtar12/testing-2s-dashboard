
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Message } from '@/types/chat';
import { 
  createEnhancedFileUploadMessage, 
  processFileUpload, 
  createFileUploadErrorMessage 
} from '@/utils/enhancedFileUploadHandler';
import { 
  createUserMessage, 
  createAIMessage, 
  createErrorMessage, 
  sendMessageToAI,
  executeAction 
} from '@/utils/messageSender';
import { ActionData } from '@/types/chat';

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (file: File) => {
    console.log('📎 Enhanced file upload started:', file.name, file.type, file.size);
    
    const userMessage = createEnhancedFileUploadMessage(file);
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      const aiMessage = await processFileUpload(file);
      setMessages(prev => [...prev, aiMessage]);
      
      toast({
        title: "File Processed",
        description: `Successfully analyzed ${file.name}`,
      });

    } catch (error) {
      console.error('❌ Enhanced file upload error:', error);
      
      const errorMessage = createFileUploadErrorMessage();
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: "Upload Error",
        description: "There was an issue processing your file.",
        variant: "destructive",
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = createUserMessage(inputValue);
    const userMessageContent = inputValue;
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const aiResponseData = await sendMessageToAI(userMessageContent, userMessage.id);
      
      // Handle both old string responses and new structured responses
      let aiMessage;
      if (typeof aiResponseData === 'string') {
        aiMessage = createAIMessage(aiResponseData);
      } else {
        aiMessage = createAIMessage(aiResponseData.response || "I'm here to help!");
        
        // Add action data if present
        if (aiResponseData.hasAction && aiResponseData.actionData) {
          aiMessage = {
            ...aiMessage,
            hasAction: true,
            actionData: aiResponseData.actionData,
            actionStatus: aiResponseData.actionStatus || 'pending_confirmation'
          };
        }
      }
      
      setMessages(prev => [...prev, aiMessage]);
      
    } catch (error) {
      console.error('Error calling edge function:', error);
      
      // Create enhanced error message based on error type
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

  const handleActionConfirm = async (messageId: string, actionData: ActionData) => {
    // Update message status to executing
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, actionStatus: 'executing' as const, actionData }
        : msg
    ));

    try {
      // Execute the action via N8N webhook
      const result = await executeAction(actionData, messageId);
      
      // Update message status to completed
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, actionStatus: 'completed' as const }
          : msg
      ));

      toast({
        title: "Action Completed",
        description: `${actionData.type === 'email' ? 'Email' : actionData.type.toUpperCase()} sent successfully`,
      });

    } catch (error) {
      console.error('❌ Action execution error:', error);
      
      // Update message status to failed
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, actionStatus: 'failed' as const }
          : msg
      ));
      
      toast({
        title: "Action Failed",
        description: `Failed to send ${actionData.type}. Please try again.`,
        variant: "destructive",
      });
    }
  };

  const handleActionCancel = (messageId: string) => {
    // Remove the action from the message
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, hasAction: false, actionData: undefined, actionStatus: undefined }
        : msg
    ));

    toast({
      title: "Action Cancelled",
      description: "The action has been cancelled.",
    });
  };

  return {
    messages,
    inputValue,
    isTyping,
    setInputValue,
    handleFileUpload,
    handleSendMessage,
    handleActionConfirm,
    handleActionCancel,
  };
};
