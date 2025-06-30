import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import Sidebar from '@/components/Sidebar';
import ChatMessage from '@/components/ChatMessage';
import WelcomeScreen from '@/components/WelcomeScreen';
import InputBar from '@/components/InputBar';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  fileName?: string;
  fileType?: string;
}

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messages: Message[];
}

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = async (file: File) => {
    console.log('File uploaded:', file.name, file.type, file.size);
    
    // Create a user message indicating file upload
    const userMessage: Message = {
      id: Date.now().toString(),
      content: `I've uploaded a file: ${file.name}`,
      isUser: true,
      timestamp: new Date(),
      fileName: file.name,
      fileType: file.type,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      // For now, we'll just acknowledge the file upload
      // In the future, you could process the file content here
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `I can see you've uploaded "${file.name}". While I can't process the file content yet, I'm here to help you with any questions about your hotel experience. What would you like to know?`,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
      
      toast({
        title: "File Uploaded",
        description: `Successfully received ${file.name}`,
      });

    } catch (error) {
      console.error('Error handling file upload:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I encountered an issue with your file upload. Please try again or ask me a question instead.",
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: "Upload Error",
        description: "There was an issue with your file upload.",
        variant: "destructive",
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      isUser: true,
      timestamp: new Date(),
    };

    const userMessageContent = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      console.log('Sending message to Supabase edge function:', userMessageContent);
      
      // Call the new Supabase edge function
      const { data, error } = await supabase.functions.invoke('chat-with-data', {
        body: {
          message: userMessageContent,
          messageId: userMessage.id
        }
      });

      if (error) {
        throw error;
      }

      console.log('Received response from edge function:', data);

      const aiResponseContent = data.response || "I'm unable to answer based on the current data.";
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponseContent,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
      
    } catch (error) {
      console.error('Error calling edge function:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'm unable to answer based on the current data. Please try again.",
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: "Connection Error",
        description: "Failed to connect to the AI service. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startNewChat = () => {
    setMessages([]);
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="h-12 border-b border-gray-200 flex items-center px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="mr-2"
          >
            ☰
          </Button>
          <h2 className="text-lg font-medium text-gray-900">Two Seasons Assistant</h2>
        </div>

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
          /* Chat Messages */
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-6 bg-gray-50">
              <div className="max-w-4xl mx-auto space-y-6">
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-[#C8A351] rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-[#C8A351] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-[#C8A351] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            </div>

            <InputBar
              inputValue={inputValue}
              isTyping={isTyping}
              onInputChange={setInputValue}
              onSendMessage={handleSendMessage}
              onKeyPress={handleKeyPress}
              onFileUpload={handleFileUpload}
            />
          </div>
        )}

        {/* OpenAI Branding */}
        <div className="text-center py-2 text-xs text-gray-500 border-t">
          Powered by Two Seasons Data • Hotel Assistant
        </div>
      </div>
    </div>
  );
};

export default Index;
