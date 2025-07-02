
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
  sendMessageToAI 
} from '@/utils/messageSender';

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
      const aiResponseContent = await sendMessageToAI(userMessageContent, userMessage.id);
      const aiMessage = createAIMessage(aiResponseContent);
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

  return {
    messages,
    inputValue,
    isTyping,
    setInputValue,
    handleFileUpload,
    handleSendMessage,
  };
};
