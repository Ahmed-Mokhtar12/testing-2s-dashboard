import React, { useState } from 'react';
import { MessageCircle, X, Plus, Settings, PanelLeft } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { SeraHistorySidebar } from '@/components/dashboard/SeraHistorySidebar';
import WelcomeScreen from '@/components/WelcomeScreen';
import ChatContainer from '@/components/ChatContainer';
import DocumentProcessingProgress from '@/components/DocumentProcessingProgress';
import { useChat } from '@/hooks/useChat';
import { useSeraLocalSessions } from '@/hooks/useSeraLocalSessions';
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
  } = useSeraLocalSessions();

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
          'mt-6 self-start shrink-0 h-[calc(100%-1.5rem)] overflow-hidden transition-[width] duration-300 ease-out flex',
          open ? 'w-[420px]' : 'w-0'
        )}
      >
        {open && (
          <div className="flex w-full h-full border-l border-border bg-card-gradient">
            {innerSidebar && (
              <div className="w-[220px] border-r border-border overflow-hidden">
                <SeraHistorySidebar
                  chatSessions={chatSessions}
                  activeSessionId={activeSessionId || currentSessionId}
                  onSessionSelect={handleSessionSelect}
                  onDeleteSession={handleDeleteSession}
                  onClose={() => setInnerSidebar(false)}
                />
              </div>
            )}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="h-12 px-2 flex items-center justify-between border-b border-border shrink-0 bg-card/40 backdrop-blur">
                <TooltipProvider delayDuration={200}>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-8 w-8 relative text-muted-foreground hover:text-foreground hover:bg-background/40',
                            innerSidebar && 'bg-background/50 text-foreground'
                          )}
                          onClick={() => setInnerSidebar((v) => !v)}
                          aria-label="Chat history"
                        >
                          <PanelLeft className="h-4 w-4" />
                          {!innerSidebar && chatSessions.length > 0 && (
                            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {innerSidebar ? 'Hide history' : `Chat history${chatSessions.length ? ` (${chatSessions.length})` : ''}`}
                      </TooltipContent>
                    </Tooltip>

                    <div className="flex items-center gap-2 px-1.5">
                      <div className="h-7 w-7 rounded-full bg-card border border-primary/40 overflow-hidden flex items-center justify-center shrink-0">
                        <img src={twoSeasonsLogo} alt="Sera" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex flex-col leading-tight">
                        <span className="text-sm font-medium text-foreground">Sera</span>
                        <span className="text-[10px] text-muted-foreground">AI Consultant</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={startNewChat} aria-label="New chat">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">New chat</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Settings">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Settings</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)} aria-label="Close chat">
                          <X className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Close</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
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
