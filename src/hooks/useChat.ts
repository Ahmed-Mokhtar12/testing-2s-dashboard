
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Message } from '@/types/chat';
import { 
  createFileUploadMessage, 
  createFileUploadResponse, 
  createFileUploadErrorMessage 
} from '@/utils/fileUploadHandler';
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
    console.log('File uploaded:', file.name, file.type, file.size);
    
    const userMessage = createFileUploadMessage(file);
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      const aiMessage = createFileUploadResponse();
      setMessages(prev => [...prev, aiMessage]);
      
      toast({
        title: "File Uploaded",
        description: `Successfully received ${file.name}`,
      });

    } catch (error) {
      console.error('Error handling file upload:', error);
      
      const errorMessage = createFileUploadErrorMessage();
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: "Upload Error",
        description: "There was an issue with your file upload.",
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
      
      const errorMessage = createErrorMessage();
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: "Connection Error",
        description: "Failed to connect to the AI service. Please try again.",
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
