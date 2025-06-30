
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, LayoutDashboard, LogIn, Send, Mic, Upload, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
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
      console.log('Sending message to n8n webhook:', userMessageContent);
      
      const response = await fetch('https://n8n-2seasons-u38985.vm.elestio.app/webhook-test/369c597c-2dca-4de5-93c8-c912f4fcc19e', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessageContent,
          timestamp: new Date().toISOString(),
          messageId: userMessage.id
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Received response from n8n:', data);

      const aiResponseContent = data.response || data.message || data.text || "I'm unable to answer based on the current data.";
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponseContent,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
      
    } catch (error) {
      console.error('Error calling n8n webhook:', error);
      
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

  return (
    <div className="h-screen bg-white flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 bg-[#1E1E1E] text-white flex flex-col overflow-hidden`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-[#C8A351] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">TS</span>
            </div>
            <h1 className="text-lg font-semibold">Two Seasons GPT</h1>
          </div>
          <Button
            onClick={startNewChat}
            className="w-full bg-transparent border border-gray-600 hover:bg-gray-700 text-white flex items-center gap-2"
          >
            <Plus size={16} />
            New Chat
          </Button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {chatSessions.map((session) => (
              <div
                key={session.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  activeSessionId === session.id 
                    ? 'bg-gray-700' 
                    : 'hover:bg-gray-800'
                }`}
                onClick={() => setActiveSessionId(session.id)}
              >
                <div className="text-sm font-medium truncate">{session.title}</div>
                <div className="text-xs text-gray-400 truncate">{session.lastMessage}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" className="text-white hover:bg-gray-700">
              <LayoutDashboard size={16} />
              Dashboard
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-white hover:bg-gray-700">
              <LogIn size={16} />
              Log In
            </Button>
            <Button variant="ghost" size="sm" className="text-white hover:bg-gray-700">
              <Settings size={16} />
            </Button>
          </div>
        </div>
      </div>

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
          /* Welcome Screen */
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 bg-gray-50">
            <div className="text-center max-w-2xl mb-8">
              <div className="w-16 h-16 bg-[#C8A351] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-xl">TS</span>
              </div>
              <h2 className="text-3xl font-light text-gray-900 mb-4">
                Welcome to Two Seasons GPT
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Your intelligent assistant for hotel services, reservations, and inquiries
              </p>
            </div>
            
            {/* Centered Input Area */}
            <div className="w-full max-w-3xl">
              <div className="flex items-end space-x-3">
                <div className="flex-1 relative">
                  <div className="relative rounded-2xl border border-gray-300 bg-white shadow-sm focus-within:border-[#C8A351] focus-within:ring-1 focus-within:ring-[#C8A351]">
                    <Input
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask something..."
                      className="border-0 rounded-2xl resize-none bg-transparent px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none min-h-[50px]"
                      disabled={isTyping}
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                        <Mic size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                        <Upload size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isTyping}
                  className="rounded-2xl px-6 py-3 bg-[#C8A351] hover:bg-[#B8934A] text-white font-medium transition-colors"
                >
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Chat Messages */
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-6 bg-gray-50">
              <div className="max-w-4xl mx-auto space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        message.isUser
                          ? 'bg-[#C8A351] text-white'
                          : 'bg-white border border-gray-200 text-gray-900'
                      } shadow-sm`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      <div className={`text-xs mt-2 ${message.isUser ? 'text-white/70' : 'text-gray-500'}`}>
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
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

            {/* Fixed Bottom Input Area */}
            <div className="border-t bg-white">
              <div className="px-4 py-4">
                <div className="flex items-end space-x-3 max-w-3xl mx-auto">
                  <div className="flex-1 relative">
                    <div className="relative rounded-2xl border border-gray-300 bg-white shadow-sm focus-within:border-[#C8A351] focus-within:ring-1 focus-within:ring-[#C8A351]">
                      <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask something..."
                        className="border-0 rounded-2xl resize-none bg-transparent px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none min-h-[50px] pr-20"
                        disabled={isTyping}
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                          <Mic size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                          <Upload size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || isTyping}
                    className="rounded-2xl px-6 py-3 bg-[#C8A351] hover:bg-[#B8934A] text-white font-medium transition-colors"
                  >
                    <Send size={16} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* OpenAI Branding */}
        <div className="text-center py-2 text-xs text-gray-500 border-t">
          Powered by OpenAI • Two Seasons GPT
        </div>
      </div>
    </div>
  );
};

export default Index;
