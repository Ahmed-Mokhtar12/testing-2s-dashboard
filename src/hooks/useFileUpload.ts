import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Message } from '@/types/chat';
import { 
  createEnhancedFileUploadMessage, 
  processFileUpload, 
  createFileUploadErrorMessage 
} from '@/utils/enhancedFileUploadHandler';
import { ProcessingProgress } from '@/utils/clientSideDocumentProcessor';

export const useFileUpload = () => {
  const { toast } = useToast();
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);

  const handleFileUpload = async (
    file: File,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    setIsTyping: React.Dispatch<React.SetStateAction<boolean>>,
    sessionId?: string
  ) => {
    console.log('📎 Enhanced file upload started:', file.name, file.type, file.size);
    
    const userMessage = createEnhancedFileUploadMessage(file);
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      const aiMessage = await processFileUpload(
        file, 
        sessionId, 
        (progress) => setProcessingProgress(progress)
      );
      
      setMessages(prev => [...prev, aiMessage]);
      
      toast({
        title: "تم معالجة الملف",
        description: `تم تحليل ${file.name} بنجاح`,
      });

      // Clear progress after a delay
      setTimeout(() => setProcessingProgress(null), 3000);

    } catch (error) {
      console.error('❌ Enhanced file upload error:', error);
      
      const errorMessage = createFileUploadErrorMessage();
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: "خطأ في الرفع",
        description: "حدث خطأ أثناء معالجة الملف.",
        variant: "destructive",
      });
      
      setProcessingProgress(null);
    } finally {
      setIsTyping(false);
    }
  };

  return { 
    handleFileUpload, 
    processingProgress,
    clearProgress: () => setProcessingProgress(null)
  };
};