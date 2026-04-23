import { useState, useEffect, useRef } from 'react';
import { Message, ActionData } from '@/types/chat';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useMessageSending } from '@/hooks/useMessageSending';
import { useActionHandling } from '@/hooks/useActionHandling';
import { useSessionManagement } from '@/hooks/useSessionManagement';

interface UseChatProps {
  onSaveChatMessage?: (userMessage: string, aiReply: string, sessionId?: string) => Promise<void>;
  activeSessionId?: string | null;
  createNewSessionId?: () => string;
  onSessionIdChange?: (sessionId: string | null) => void;
}

export const useChat = ({
  onSaveChatMessage,
  activeSessionId,
  createNewSessionId,
  onSessionIdChange,
}: UseChatProps = {}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(activeSessionId || null);

  const { handleFileUpload, processingProgress, clearProgress } = useFileUpload();
  const { handleSendMessage: sendMessage } = useMessageSending({
    onSaveChatMessage,
    activeSessionId,
    createNewSessionId,
  });
  const { handleActionConfirm, handleActionCancel } = useActionHandling();
  const { loadSessionMessages, clearMessages } = useSessionManagement();

  // Sync external activeSessionId -> internal currentSessionId
  useEffect(() => {
    if (activeSessionId !== undefined && activeSessionId !== currentSessionId) {
      setCurrentSessionId(activeSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Notify parent when internal currentSessionId changes
  const lastNotifiedRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!onSessionIdChange) return;
    if (lastNotifiedRef.current === currentSessionId) return;
    if (currentSessionId === activeSessionId) {
      lastNotifiedRef.current = currentSessionId;
      return;
    }
    lastNotifiedRef.current = currentSessionId;
    onSessionIdChange(currentSessionId);
  }, [currentSessionId, activeSessionId, onSessionIdChange]);

  const wrappedFileUpload = (file: File) => {
    return handleFileUpload(file, setMessages, setIsTyping, currentSessionId);
  };

  const wrappedSendMessage = () => {
    return sendMessage(inputValue, setMessages, setInputValue, setIsTyping, currentSessionId, setCurrentSessionId);
  };

  const wrappedActionConfirm = (messageId: string, actionData: ActionData) => {
    return handleActionConfirm(messageId, actionData, setMessages);
  };

  const wrappedActionCancel = (messageId: string) => {
    return handleActionCancel(messageId, setMessages);
  };

  const wrappedLoadSessionMessages = (sessionMessages: import('./useSessionManagement').StoredSessionMessage[]) => {
    return loadSessionMessages(sessionMessages, setMessages);
  };

  const wrappedClearMessages = () => {
    return clearMessages(setMessages, setCurrentSessionId);
  };

  return {
    messages,
    inputValue,
    isTyping,
    currentSessionId,
    processingProgress,
    setInputValue,
    handleFileUpload: wrappedFileUpload,
    handleSendMessage: wrappedSendMessage,
    handleActionConfirm: wrappedActionConfirm,
    handleActionCancel: wrappedActionCancel,
    loadSessionMessages: wrappedLoadSessionMessages,
    clearMessages: wrappedClearMessages,
    clearProgress,
  };
};
