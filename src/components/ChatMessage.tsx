import React from 'react';
import { Message, ActionData } from '@/types/chat';
import ActionConfirmationMessage from './ActionConfirmationMessage';
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
  const formatContent = (content: string) =>
    content.split('\n').map((line, index, arr) => (
      <span key={index}>
        {line}
        {index < arr.length - 1 && <br />}
      </span>
    ));

  if (message.hasAction && message.actionData && message.actionData.type === 'sms') {
    return (
      <div className="py-3">
        <ActionConfirmationMessage
          actionData={message.actionData}
          actionStatus={message.actionStatus || 'pending_confirmation'}
          onConfirm={(updatedActionData) => onActionConfirm?.(message.id, updatedActionData)}
          onCancel={() => onActionCancel?.(message.id)}
        />
      </div>
    );
  }

  if (message.isUser) {
    return (
      <div className="flex justify-end py-2">
        <div className="max-w-[85%] bg-primary/10 border border-primary/20 rounded-xl px-3 py-2 text-sm text-foreground">
          <div className="whitespace-pre-wrap leading-relaxed">{formatContent(message.content)}</div>
          <div className="text-[10px] mt-1 text-foreground/40 text-right">
            {formatChatTimestamp(message.timestamp)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 mt-0.5">
        <img src={twoSeasonsLogo} alt="Sera" className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="whitespace-pre-wrap leading-relaxed text-sm text-foreground/90">
          {formatContent(message.content)}
        </div>
        <div className="text-[10px] mt-1.5 text-foreground/40">
          {formatChatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
