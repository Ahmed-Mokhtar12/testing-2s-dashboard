
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
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  inputValue,
  isTyping,
  onInputChange,
  onSendMessage,
  onKeyPress,
  onFileUpload
}) => {
  return (
    <div className="flex-1 flex flex-col">
      <MessageList messages={messages} isTyping={isTyping} />
      <InputBar
        inputValue={inputValue}
        isTyping={isTyping}
        onInputChange={onInputChange}
        onSendMessage={onSendMessage}
        onKeyPress={onKeyPress}
        onFileUpload={onFileUpload}
      />
    </div>
  );
};

export default ChatContainer;
