
import React, { useRef, useEffect } from 'react';
import ChatMessage from '@/components/ChatMessage';
import TypingIndicator from '@/components/TypingIndicator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Message } from '@/types/chat';

interface MessageListProps {
  messages: Message[];
  isTyping: boolean;
  onActionConfirm?: (messageId: string, actionData: any) => void;
  onActionCancel?: (messageId: string) => void;
}

const MessageList: React.FC<MessageListProps> = ({ messages, isTyping, onActionConfirm, onActionCancel }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="h-full bg-gray-50">
      <ScrollArea className="h-full">
        <div className="px-4 py-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {messages.map((message) => (
              <ChatMessage 
                key={message.id} 
                message={message} 
                onActionConfirm={onActionConfirm}
                onActionCancel={onActionCancel}
              />
            ))}
            
            {isTyping && <TypingIndicator />}
            
            <div ref={messagesEndRef} />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default MessageList;
