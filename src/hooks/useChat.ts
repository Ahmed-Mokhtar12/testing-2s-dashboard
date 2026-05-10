import { useState, useEffect, useRef, useCallback } from 'react';
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

  useEffect(() => {
    if (activeSessionId !== undefined && activeSessionId !== currentSessionId) {
      setCurrentSessionId(activeSessionId);
    }
  }, [activeSessionId, currentSessionId]);

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

  const wrappedFileUpload = useCallback((file: File) => {
    return handleFileUpload(file, setMessages, setIsTyping, currentSessionId);
  }, [currentSessionId, handleFileUpload]);

  const wrappedSendMessage = useCallback(() => {
    return sendMessage(inputValue, setMessages, setInputValue, setIsTyping, currentSessionId, setCurrentSessionId);
  }, [inputValue, currentSessionId, sendMessage]);

  const wrappedActionConfirm = useCallback((messageId: string, actionData: ActionData) => {
    return handleActionConfirm(messageId, actionData, setMessages);
  }, [handleActionConfirm]);

  const wrappedActionCancel = useCallback((messageId: string) => {
    return handleActionCancel(messageId, setMessages);
  }, [handleActionCancel]);

  const wrappedLoadSessionMessages = useCallback((sessionMessages: import('./useSessionManagement').StoredSessionMessage[]) => {
    return loadSessionMessages(sessionMessages, setMessages);
  }, [loadSessionMessages]);

  const wrappedClearMessages = useCallback(() => {
    return clearMessages(setMessages, setCurrentSessionId);
  }, [clearMessages]);

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
