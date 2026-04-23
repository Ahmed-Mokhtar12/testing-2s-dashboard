import React, { useState } from 'react';
import { Message, ActionData } from '@/types/chat';
import ActionConfirmationMessage from './ActionConfirmationMessage';
import { User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatChatTimestamp } from '@/utils/timezone';
import twoSeasonsLogo from '@/assets/two-seasons-logo.png';

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
}) => {
  const [, setIsEditing] = useState(false);
  const { toast } = useToast();

  const formatContent = (content: string) =>
    content.split('\n').map((line, index, arr) => (
      <span key={index}>
        {line}
        {index < arr.length - 1 && <br />}
      </span>
    ));

  return (
    <div className={`flex ${message.isUser ? 'justify-end' : 'justify-start'} mb-6`}>
      <div className="flex items-start gap-3 max-w-[85%] relative">
        {!message.isUser && (
          <div className="w-8 h-8 rounded-full bg-card border border-primary/40 glow-primary overflow-hidden flex items-center justify-center flex-shrink-0 mt-1">
            <img src={twoSeasonsLogo} alt="Sera" className="w-6 h-6 object-contain" />
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
            className={`rounded-2xl px-4 py-3 shadow-card-soft ${
              message.isUser
                ? 'bg-primary-gradient text-primary-foreground rounded-tr-md ml-2'
                : 'bg-card border border-border text-card-foreground rounded-tl-md'
            }`}
          >
            <div className={`whitespace-pre-wrap leading-relaxed ${message.isUser ? 'text-right' : 'text-left'}`}>
              {formatContent(message.content)}
            </div>
            <div className={`text-[10px] mt-2 ${message.isUser ? 'text-primary-foreground/70' : 'text-foreground/50'} text-left`}>
              {formatChatTimestamp(message.timestamp)} <span className="opacity-60">(Dubai)</span>
            </div>
          </div>
        )}

        {message.isUser && (
          <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/40 text-accent flex items-center justify-center flex-shrink-0 mt-1">
            <User size={14} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
