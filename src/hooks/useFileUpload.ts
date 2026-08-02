import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Message } from '@/types/chat';
import {
  createEnhancedFileUploadMessage,
  processFileUpload,
  createFileUploadErrorMessage,
} from '@/utils/enhancedFileUploadHandler';
// TYPE-ONLY: a plain import of this interface drags pdfjs-dist and mammoth
// (~820 kB) into the entry chunk. See the note in enhancedFileUploadHandler.ts.
import type { ProcessingProgress } from '@/utils/clientSideDocumentProcessor';

export const useFileUpload = () => {
  const { toast } = useToast();
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
      }
    };
  }, []);

  const handleFileUpload = async (
    file: File,
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    setIsTyping: React.Dispatch<React.SetStateAction<boolean>>,
    sessionId?: string
  ) => {
    const userMessage = createEnhancedFileUploadMessage(file);
    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);

    try {
      const aiMessage = await processFileUpload(
        file,
        sessionId,
        (progress) => setProcessingProgress(progress)
      );

      setMessages((prev) => [...prev, aiMessage]);

      toast({
        title: 'File processed',
        description: `${file.name} was analyzed successfully.`,
      });

      progressTimerRef.current = setTimeout(() => setProcessingProgress(null), 3000);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Enhanced file upload error:', error);

      const errorMessage = createFileUploadErrorMessage();
      setMessages((prev) => [...prev, errorMessage]);

      toast({
        title: 'Upload failed',
        description: 'There was a problem while processing the file.',
        variant: 'destructive',
      });

      setProcessingProgress(null);
    } finally {
      setIsTyping(false);
    }
  };

  return {
    handleFileUpload,
    processingProgress,
    clearProgress: () => setProcessingProgress(null),
  };
};
