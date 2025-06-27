
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, LayoutDashboard, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
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

      // Extract the AI response from the webhook response
      // Adjust this based on your n8n webhook response structure
      const aiResponseContent = data.response || data.message || data.text || 'I received your message but could not generate a response.';
      
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
        content: 'Sorry, I encountered an error while processing your message. Please try again.',
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
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Chat Assistant</h1>
          <div className="flex items-center gap-2">
            <Button
              onClick={startNewChat}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Plus size={16} />
              New Chat
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <LayoutDashboard size={16} />
              Dashboard
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <LogIn size={16} />
              Log In
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {messages.length === 0 ? (
          /* Welcome Screen with Centered Input */
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
            <div className="text-center max-w-2xl mb-8">
              <h2 className="text-4xl font-light text-gray-900 mb-4">
                Ready when you are.
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Start a conversation with your AI assistant
              </p>
            </div>
            
            {/* Centered Input Area */}
            <div className="w-full max-w-3xl">
              <div className="flex items-end space-x-3">
                <div className="flex-1 relative">
                  <div className="relative rounded-2xl border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                    <Input
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask anything"
                      className="border-0 rounded-2xl resize-none bg-transparent px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none min-h-[50px]"
                      disabled={isTyping}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isTyping}
                  className="rounded-2xl px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                >
                  Send
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Chat Messages */
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-6">
              <div className="max-w-4xl mx-auto space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        message.isUser
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-900'
                      } shadow-sm`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Fixed Bottom Input Area */}
            <div className="border-t bg-white/80 backdrop-blur-sm">
              <div className="px-4 py-4">
                <div className="flex items-end space-x-3 max-w-3xl mx-auto">
                  <div className="flex-1 relative">
                    <div className="relative rounded-2xl border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                      <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask anything"
                        className="border-0 rounded-2xl resize-none bg-transparent px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none min-h-[50px]"
                        disabled={isTyping}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || isTyping}
                    className="rounded-2xl px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                  >
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
