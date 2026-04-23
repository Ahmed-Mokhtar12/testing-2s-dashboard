import React, { useState } from 'react';
import { MessageCircle, X, Plus, Settings, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Sidebar from '@/components/Sidebar';
import WelcomeScreen from '@/components/WelcomeScreen';
import ChatContainer from '@/components/ChatContainer';
import DocumentProcessingProgress from '@/components/DocumentProcessingProgress';
import { useChat } from '@/hooks/useChat';
import { useChatSessions } from '@/hooks/useChatSessions';
import { cn } from '@/lib/utils';
import twoSeasonsLogo from '@/assets/two-seasons-logo.png';

/**
 * RightChatPanel — collapsible right-side AI chat (Sera).
 * Pushes content (no overlay) when open.
 */
export const RightChatPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [innerSidebar, setInnerSidebar] = useState(false);

  const {
    chatSessions,
    activeSessionId,
    saveChatMessage,
    createNewSession,
    selectSession,
    deleteSession,
    createNewSessionId,
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
    createNewSessionId,
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

  const handleDeleteSession = (sessionId: string) => {
    deleteSession(sessionId);
    if (activeSessionId === sessionId || currentSessionId === sessionId) clearMessages();
  };

  return (
    <>
      {/* Floating trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Sera AI chat"
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary-gradient text-primary-foreground flex items-center justify-center shadow-card-soft glow-primary animate-pulse-glow hover:scale-105 transition-transform"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Side panel — pushes layout */}
      <aside
        className={cn(
          'shrink-0 h-screen border-l border-border bg-card-gradient transition-[width] duration-300 ease-out overflow-hidden flex',
          open ? 'w-[420px]' : 'w-0'
        )}
      >
        {open && (
          <div className="flex w-full h-full">
            {innerSidebar && (
              <div className="w-[200px] border-r border-border overflow-hidden">
                <Sidebar
                  sidebarOpen={true}
                  chatSessions={chatSessions}
                  activeSessionId={activeSessionId || currentSessionId}
                  onNewChat={startNewChat}
                  onSessionSelect={handleSessionSelect}
                  onDeleteSession={handleDeleteSession}
                />
              </div>
            )}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="h-12 px-3 flex items-center justify-between border-b border-border shrink-0 bg-card/40 backdrop-blur">
                <button
                  onClick={() => setInnerSidebar((v) => !v)}
                  className="flex items-center gap-2 hover:bg-background/40 rounded-md px-1.5 py-1 transition-colors"
                >
                  <div className="h-7 w-7 rounded-full bg-card border border-primary/40 overflow-hidden flex items-center justify-center">
                    <img src={twoSeasonsLogo} alt="Sera" className="w-5 h-5 object-contain" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Sera</span>
                  <ChevronDown size={14} className="text-muted-foreground" />
                </button>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={startNewChat} aria-label="New chat">
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" aria-label="Settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)} aria-label="Close chat">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0 bg-transparent">
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
            </div>
          </div>
        )}
      </aside>

      {processingProgress && (
        <DocumentProcessingProgress
          progress={processingProgress}
          fileName={processingProgress.stage !== 'complete' ? 'Processing document...' : 'Complete'}
          onClose={clearProgress}
        />
      )}
    </>
  );
};
