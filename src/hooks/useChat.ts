
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  fileName?: string;
  fileType?: string;
}

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (file: File) => {
    console.log('File uploaded:', file.name, file.type, file.size);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      content: `I've uploaded a file: ${file.name}`,
      isUser: true,
      timestamp: new Date(),
      fileName: file.name,
      fileType: file.type,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `I can see you've uploaded "${file.name}". While I can't process the file content yet, I'm here to help you with any questions about your hotel experience. What would you like to know?`,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
      
      toast({
        title: "File Uploaded",
        description: `Successfully received ${file.name}`,
      });

    } catch (error) {
      console.error('Error handling file upload:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I encountered an issue with your file upload. Please try again or ask me a question instead.",
        isUser: false,
        timestamp: new Date(),
      };

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

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      isUser: true,
      timestamp: new Date(),
    };

    const userMessageContent = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      console.log('Sending message to Supabase edge function:', userMessageContent);
      
      const { data, error } = await supabase.functions.invoke('chat-with-data', {
        body: {
          message: userMessageContent,
          messageId: userMessage.id
        }
      });

      if (error) {
        throw error;
      }

      console.log('Received response from edge function:', data);

      const aiResponseContent = data.response || "I'm unable to answer based on the current data.";
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponseContent,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
      
    } catch (error) {
      console.error('Error calling edge function:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'm unable to answer based on the current data. Please try again.",
        isUser: false,
        timestamp: new Date(),
      };

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
