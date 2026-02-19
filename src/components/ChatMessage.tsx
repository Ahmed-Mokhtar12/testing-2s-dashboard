
import React from 'react';
import { Message, ActionData } from '@/types/chat';
import ActionConfirmationMessage from './ActionConfirmationMessage';
import { useToast } from '@/hooks/use-toast';
import { formatChatTimestamp } from '@/utils/timezone';

interface ChatMessageProps {
  message: Message;
  onActionConfirm?: (messageId: string, actionData: ActionData) => void;
  onActionCancel?: (messageId: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  onActionConfirm, 
  onActionCancel, 
  onRegenerateMessage, 
  onEditMessage 
}) => {
  const { toast } = useToast();

  // Enhanced formatting for text content
  const formatContent = (content: string) => {
    // Add better line breaks and spacing for text
    return content
      .split('\n')
      .map((line, index) => (
        <span key={index}>
          {line}
          {index < content.split('\n').length - 1 && <br />}
        </span>
      ));
  };

  return (
    <div className={`flex ${message.isUser ? 'justify-end' : 'justify-start'} mb-6`}>
      <div className="flex items-start gap-3 max-w-[85%] relative">
        {!message.isUser && (
          <div className="w-8 h-8 bg-gradient-to-br from-[#C8A351] to-[#B8934A] rounded-full flex items-center justify-center flex-shrink-0 mt-1">
            <span className="text-white font-bold text-xs">TS</span>
          </div>
        )}
        
        {message.hasAction && message.actionData ? (
          <ActionConfirmationMessage
            actionData={message.actionData}
            actionStatus={message.actionStatus || 'pending_confirmation'}
            onConfirm={(updatedActionData) => onActionConfirm?.(message.id, updatedActionData)}
            onCancel={() => onActionCancel?.(message.id)}
          />
        ) : (
          <div
            className={`rounded-2xl px-4 py-3 shadow-sm ${
              message.isUser
                ? 'bg-gradient-to-r from-[#C8A351] to-[#B8934A] text-white ml-3'
                : 'bg-white border border-gray-200 text-gray-900'
            }`}
          >
            <div className={`whitespace-pre-wrap leading-relaxed ${message.isUser ? 'text-right' : 'text-left'}`}>
              {formatContent(message.content)}
            </div>
            <div className={`text-xs mt-3 ${message.isUser ? 'text-white/70' : 'text-gray-500'} text-left`}>
              {formatChatTimestamp(message.timestamp)} <span className="opacity-60">(Dubai Time)</span>
            </div>
          </div>
        )}


        {message.isUser && (
          <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
            <span className="text-white font-bold text-xs">You</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
