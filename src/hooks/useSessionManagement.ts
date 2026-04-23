import { Message } from '@/types/chat';
import { createUserMessage, createAIMessage } from '@/utils/messageSender';

export const useSessionManagement = () => {
  const loadSessionMessages = (
    sessionMessages: Message[],
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  ) => {
    const formattedMessages: Message[] = [];
    sessionMessages.forEach((msg) => {
      if (msg.userMessage) {
        // Handle both old JSON format and new plain text format
        let userMessageText = msg.userMessage;
        try {
          // If it's a JSON string, extract the body
          if (typeof userMessageText === 'string' && userMessageText.startsWith('{')) {
            const parsed = JSON.parse(userMessageText);
            userMessageText = parsed.body || userMessageText;
          }
        } catch {
          // If parsing fails, use the original text
        }
        formattedMessages.push(createUserMessage(userMessageText));
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