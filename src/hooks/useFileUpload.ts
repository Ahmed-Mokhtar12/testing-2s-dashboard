import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Message } from '@/types/chat';
import { 
  createEnhancedFileUploadMessage, 
  processFileUpload, 
  createFileUploadErrorMessage 
} from '@/utils/enhancedFileUploadHandler';

export const useFileUpload = () => {
  const { toast } = useToast();

  const handleFileUpload = async (
    file: File,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    setIsTyping: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
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

  return { handleFileUpload };
};