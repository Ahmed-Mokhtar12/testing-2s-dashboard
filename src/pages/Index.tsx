
import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import WelcomeScreen from '@/components/WelcomeScreen';
import ChatContainer from '@/components/ChatContainer';
import ChatHeader from '@/components/ChatHeader';
import ChatFooter from '@/components/ChatFooter';
import DocumentProcessingProgress from '@/components/DocumentProcessingProgress';
import { useChat } from '@/hooks/useChat';
import { useChatSessions } from '@/hooks/useChatSessions';

const Index = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const {
    chatSessions,
    activeSessionId,
    loading,
    saveChatMessage,
    createNewSession,
    selectSession,
    deleteSession,
    createNewSessionId
  } = useChatSessions();
  
  const {
    messages,
    inputValue,
    isTyping,
    currentSessionId,
    processingProgress,
    setInputValue,
    handleFileUpload,
    handleSendMessage,
    handleActionConfirm,
    handleActionCancel,
    loadSessionMessages,
    clearMessages,
    clearProgress,
  } = useChat({ 
    onSaveChatMessage: saveChatMessage,
    activeSessionId,
    createNewSessionId
  });

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startNewChat = () => {
    // Create new session and clear current messages
    const newSessionId = createNewSession();
    clearMessages();
    console.log('Started new chat with session ID:', newSessionId);
  };

  const handleSessionSelect = (sessionId: string) => {
    console.log('Selecting session:', sessionId);
    const sessionMessages = selectSession(sessionId);
    loadSessionMessages(sessionMessages);
  };

  const handleDeleteSession = (sessionId: string) => {
    console.log('Deleting session:', sessionId);
    deleteSession(sessionId);
    // If the deleted session was active, clear messages
    if (activeSessionId === sessionId || currentSessionId === sessionId) {
      clearMessages();
    }
  };

  // Handle message regeneration - fixed: pass content directly to avoid async state race condition
  const handleRegenerateMessage = (messageId: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex > 0) {
      const userMessage = messages[messageIndex - 1];
      if (userMessage.isUser) {
        // Set input and trigger send directly with the content value
        setInputValue(userMessage.content);
        // Use setTimeout to allow React to flush state update before sending
        setTimeout(() => {
          handleSendMessage();
        }, 0);
      }
    }
  };

  // Handle message editing - fixed: apply the truncated messages list
  const handleEditMessage = (messageId: string, newContent: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex !== -1) {
      // Remove this message and all subsequent ones, then set new input
      const trimmedMessages = messages.slice(0, messageIndex);
      loadSessionMessages(trimmedMessages);
    }
    setInputValue(newContent);
  };

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      <Sidebar
        sidebarOpen={sidebarOpen}
        chatSessions={chatSessions}
        activeSessionId={activeSessionId || currentSessionId}
        onNewChat={startNewChat}
        onSessionSelect={handleSessionSelect}
        onDeleteSession={handleDeleteSession}
      />

      <div className="flex-1 flex flex-col h-screen">
        <ChatHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        <div className="flex-1 flex flex-col min-h-0">
          {messages.length === 0 ? (
            <WelcomeScreen
              inputValue={inputValue}
              isTyping={isTyping}
              onInputChange={setInputValue}
              onSendMessage={handleSendMessage}
              onKeyPress={handleKeyPress}
              onFileUpload={handleFileUpload}
            />
          ) : (
            <ChatContainer
              messages={messages}
              inputValue={inputValue}
              isTyping={isTyping}
              onInputChange={setInputValue}
              onSendMessage={handleSendMessage}
              onKeyPress={handleKeyPress}
              onFileUpload={handleFileUpload}
              onActionConfirm={handleActionConfirm}
              onActionCancel={handleActionCancel}
              onRegenerateMessage={handleRegenerateMessage}
              onEditMessage={handleEditMessage}
            />
          )}
        </div>

        <ChatFooter />
      </div>

      {/* Document Processing Progress */}
      {processingProgress && (
        <DocumentProcessingProgress
          progress={processingProgress}
          fileName={processingProgress.stage !== 'complete' ? 'معالجة المستند...' : 'اكتمل'}
          onClose={clearProgress}
        />
      )}
    </div>
  );
};

export default Index;
