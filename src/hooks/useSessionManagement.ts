import { Message } from '@/types/chat';
import { createUserMessage, createAIMessage } from '@/utils/messageSender';

export const useSessionManagement = () => {
  const loadSessionMessages = (
    sessionMessages: any[],
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  ) => {
    const formattedMessages: Message[] = [];
    sessionMessages.forEach((msg) => {
      if (msg.userMessage) {
        formattedMessages.push(createUserMessage(msg.userMessage));
      }
      if (msg.aiReply) {
        formattedMessages.push(createAIMessage(msg.aiReply));
      }
    });
    setMessages(formattedMessages);
  };

  const clearMessages = (
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    setCurrentSessionId: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    setMessages([]);
    setCurrentSessionId(null);
  };

  return { loadSessionMessages, clearMessages };
};