
import { Message } from '@/types/chat';

const createMessageId = () => crypto.randomUUID();

export const createFileUploadMessage = (file: File): Message => ({
  id: createMessageId(),
  content: `I've uploaded a file: ${file.name}`,
  isUser: true,
  timestamp: new Date(),
  fileName: file.name,
  fileType: file.type,
});

export const createFileUploadResponse = (): Message => ({
  id: createMessageId(),
  content: `I can see you've uploaded a file. While I can't process the file content yet, I'm here to help you with any questions about your hotel experience. What would you like to know?`,
  isUser: false,
  timestamp: new Date(),
});

export const createFileUploadErrorMessage = (): Message => ({
  id: createMessageId(),
  content: "I encountered an issue with your file upload. Please try again or ask me a question instead.",
  isUser: false,
  timestamp: new Date(),
});
