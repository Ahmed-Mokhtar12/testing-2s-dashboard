
import React, { useState } from 'react';
import { Message, ActionData } from '@/types/chat';
import ActionConfirmationMessage from './ActionConfirmationMessage';
import { Button } from '@/components/ui/button';
import { Copy, RotateCcw, Edit3, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const { toast } = useToast();

  // Copy message content
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast({
        title: "تم النسخ",
        description: "تم نسخ الرسالة إلى الحافظة",
      });
    } catch (err) {
      toast({
        title: "خطأ",
        description: "فشل في نسخ الرسالة",
        variant: "destructive",
      });
    }
  };

  // Handle edit submit
  const handleEditSubmit = () => {
    if (editContent.trim() !== message.content) {
      onEditMessage?.(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

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
    <div 
      className={`flex ${message.isUser ? 'justify-end' : 'justify-start'} mb-6 group`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
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
              {message.timestamp.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
              })}
            </div>
          </div>
        )}

        {/* Action buttons on hover */}
        {isHovered && !message.hasAction && (
          <div className={`absolute ${message.isUser ? 'left-0 -translate-x-2' : 'right-0 translate-x-2'} top-0 flex flex-col gap-1 bg-white shadow-lg rounded-lg p-1 border opacity-0 group-hover:opacity-100 transition-opacity duration-200`}>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopy}
              className="h-8 w-8 p-0 hover:bg-gray-100"
              title="نسخ"
            >
              <Copy size={14} />
            </Button>
            
            {!message.isUser && onRegenerateMessage && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRegenerateMessage(message.id)}
                className="h-8 w-8 p-0 hover:bg-gray-100"
                title="إعادة إنتاج"
              >
                <RotateCcw size={14} />
              </Button>
            )}
            
            {message.isUser && onEditMessage && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(true)}
                className="h-8 w-8 p-0 hover:bg-gray-100"
                title="تعديل"
              >
                <Edit3 size={14} />
              </Button>
            )}
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
