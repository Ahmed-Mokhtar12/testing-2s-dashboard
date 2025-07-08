
import React from 'react';
import MessageList from '@/components/MessageList';
import InputBar from '@/components/InputBar';
import { Message } from '@/types/chat';

interface ChatContainerProps {
  messages: Message[];
  inputValue: string;
  isTyping: boolean;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onFileUpload: (file: File) => void;
  onActionConfirm?: (messageId: string, actionData: any) => void;
  onActionCancel?: (messageId: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  inputValue,
  isTyping,
  onInputChange,
  onSendMessage,
  onKeyPress,
  onFileUpload,
  onActionConfirm,
  onActionCancel,
  onRegenerateMessage,
  onEditMessage
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0">
        <MessageList 
          messages={messages} 
          isTyping={isTyping} 
          onActionConfirm={onActionConfirm}
          onActionCancel={onActionCancel}
          onRegenerateMessage={onRegenerateMessage}
          onEditMessage={onEditMessage}
        />
      </div>
      <div className="flex-shrink-0">
        <InputBar
          inputValue={inputValue}
          isTyping={isTyping}
          onInputChange={onInputChange}
          onSendMessage={onSendMessage}
          onKeyPress={onKeyPress}
          onSendWithFiles={(message, files) => {
            // Handle files with message
            if (files.length > 0) {
              // Process files one by one for now
              files.forEach(file => onFileUpload(file));
            }
            if (message.trim()) {
              onSendMessage();
            }
          }}
        />
      </div>
    </div>
  );
};

export default ChatContainer;
