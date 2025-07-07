
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
    selectSession
  } = useChatSessions();
  
  const {
    messages,
    inputValue,
    isTyping,
    setInputValue,
    handleFileUpload,
    handleSendMessage,
    handleActionConfirm,
    handleActionCancel,
    loadSessionMessages,
    clearMessages,
  } = useChat({ 
    onSaveChatMessage: saveChatMessage,
    activeSessionId 
  });

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startNewChat = () => {
    createNewSession();
    clearMessages();
  };

  const handleSessionSelect = (sessionId: string) => {
    const sessionMessages = selectSession(sessionId);
    loadSessionMessages(sessionMessages);
  };

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      <Sidebar
        sidebarOpen={sidebarOpen}
        chatSessions={chatSessions}
        activeSessionId={activeSessionId}
        onNewChat={startNewChat}
        onSessionSelect={handleSessionSelect}
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
            />
          )}
        </div>

        <ChatFooter />
      </div>
    </div>
  );
};

export default Index;
