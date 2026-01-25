import React, { useEffect, useRef } from 'react';
import WhatsAppMessage from './WhatsAppMessage';
import WhatsAppInput from './WhatsAppInput';
import { useWhatsAppChat, WhatsAppMessage as MessageType } from '@/hooks/useWhatsAppChat';

const WhatsAppChat: React.FC = () => {
  const { messages, isLoading, isLoadingHistory, sendMessage } = useWhatsAppChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Chat area with WhatsApp background pattern */}
      <div 
        className="flex-1 overflow-y-auto px-4 py-2"
        style={{
          backgroundColor: '#E5DDD5',
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23C7BBA9' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {/* Loading history indicator */}
        {isLoadingHistory && (
          <div className="flex justify-center my-4">
            <div className="bg-white text-gray-500 text-xs px-3 py-2 rounded-lg shadow-sm">
              Loading conversation...
            </div>
          </div>
        )}

        {/* Welcome message */}
        {!isLoadingHistory && messages.length === 0 && (
          <div className="flex justify-center my-4">
            <div className="bg-[#FCF4CB] text-[#54656F] text-xs px-3 py-2 rounded-lg shadow-sm text-center max-w-[280px]">
              <p className="font-medium">Welcome to Two Seasons Hotel Dubai! 👋</p>
              <p className="mt-1">How can we assist you today?</p>
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <WhatsAppMessage
            key={msg.id}
            content={msg.content}
            isUser={msg.isUser}
            timestamp={msg.timestamp}
          />
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex justify-start mb-2">
            <div className="bg-white rounded-lg rounded-tl-none px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <WhatsAppInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
};

export default WhatsAppChat;
