
import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import WelcomeScreen from '@/components/WelcomeScreen';
import ChatContainer from '@/components/ChatContainer';
import ChatHeader from '@/components/ChatHeader';
import ChatFooter from '@/components/ChatFooter';
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
    setInputValue,
    handleFileUpload,
    handleSendMessage,
    handleActionConfirm,
    handleActionCancel,
    loadSessionMessages,
    clearMessages,
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

  // Handle message regeneration
  const handleRegenerateMessage = (messageId: string) => {
    // Find the user message that preceded this AI message
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex > 0) {
      const userMessage = messages[messageIndex - 1];
      if (userMessage.isUser) {
        setInputValue(userMessage.content);
        handleSendMessage();
      }
    }
  };

  // Handle message editing
  const handleEditMessage = (messageId: string, newContent: string) => {
    setInputValue(newContent);
    // Optionally remove the message and subsequent ones
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex !== -1) {
      // Remove this message and all subsequent ones
      const newMessages = messages.slice(0, messageIndex);
      // You might want to implement a method to update messages in useChat
    }
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
    </div>
  );
};

export default Index;
