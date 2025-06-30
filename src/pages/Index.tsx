
import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import WelcomeScreen from '@/components/WelcomeScreen';
import ChatContainer from '@/components/ChatContainer';
import ChatHeader from '@/components/ChatHeader';
import ChatFooter from '@/components/ChatFooter';
import { useChat } from '@/hooks/useChat';

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messages: any[];
}

const Index = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  const {
    messages,
    inputValue,
    isTyping,
    setInputValue,
    handleFileUpload,
    handleSendMessage,
  } = useChat();

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startNewChat = () => {
    setActiveSessionId(null);
  };

  const handleSessionSelect = (sessionId: string) => {
    setActiveSessionId(sessionId);
  };

  return (
    <div className="h-screen bg-white flex">
      <Sidebar
        sidebarOpen={sidebarOpen}
        chatSessions={chatSessions}
        activeSessionId={activeSessionId}
        onNewChat={startNewChat}
        onSessionSelect={handleSessionSelect}
      />

      <div className="flex-1 flex flex-col">
        <ChatHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

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
          />
        )}

        <ChatFooter />
      </div>
    </div>
  );
};

export default Index;
