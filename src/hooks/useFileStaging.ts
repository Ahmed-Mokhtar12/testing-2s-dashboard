import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export const useFileStaging = () => {
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const { toast } = useToast();

  const addFile = (file: File) => {
    // Validate file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 50MB.",
        variant: "destructive",
      });
      return false;
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Unsupported file type",
        description: "Please select a PDF, Word document, text file, or image.",
        variant: "destructive",
      });
      return false;
    }

    // Check if file already exists
    if (stagedFiles.some(f => f.name === file.name && f.size === file.size)) {
      toast({
        title: "File already attached",
        description: "This file is already attached to your message.",
        variant: "destructive",
      });
      return false;
    }

    setStagedFiles(prev => [...prev, file]);
    return true;
  };

  const removeFile = (index: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setStagedFiles([]);
  };

  return {
    stagedFiles,
    addFile,
    removeFile,
    clearFiles
  };
};