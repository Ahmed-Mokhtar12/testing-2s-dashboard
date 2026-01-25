import React from 'react';
import { Check, CheckCheck } from 'lucide-react';

interface WhatsAppMessageProps {
  content: string;
  isUser: boolean;
  timestamp: Date;
}

const WhatsAppMessage: React.FC<WhatsAppMessageProps> = ({ content, isUser, timestamp }) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm relative ${
          isUser
            ? 'bg-[#DCF8C6] rounded-tr-none'
            : 'bg-white rounded-tl-none'
        }`}
      >
        {/* Message tail */}
        <div
          className={`absolute top-0 w-0 h-0 ${
            isUser
              ? 'right-[-8px] border-l-[8px] border-l-[#DCF8C6] border-t-[8px] border-t-transparent'
              : 'left-[-8px] border-r-[8px] border-r-white border-t-[8px] border-t-transparent'
          }`}
        />
        
        <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{content}</p>
        
        <div className={`flex items-center gap-1 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-gray-500">{formatTime(timestamp)}</span>
          {isUser && (
            <CheckCheck size={14} className="text-[#53BDEB]" />
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatsAppMessage;
