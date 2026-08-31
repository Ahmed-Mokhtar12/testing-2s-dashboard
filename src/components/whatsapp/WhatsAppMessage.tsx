import React from 'react';
import { ExternalLink, UserCheck } from 'lucide-react';
import AttachmentBubble, { AttachmentBubbleData } from './AttachmentBubble';

interface WhatsAppMessageProps {
  content: string;
  isUser: boolean;
  isHumanReply?: boolean;
  timestamp: Date;
  mediaUrl?: string;
  attachment?: AttachmentBubbleData;
  repliedByName?: string;
}

const isImageUrl = (url: string): boolean => {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
};

const WhatsAppMessage: React.FC<WhatsAppMessageProps> = ({ content, isUser, isHumanReply, timestamp, mediaUrl, attachment, repliedByName }) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const hasMediaBlock = !!attachment || !!mediaUrl;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[65%] rounded-lg shadow-sm relative ${
          isUser
            ? 'bg-[#DCF8C6] rounded-tr-none'
            : isHumanReply
            ? 'bg-[#FFF3E0] rounded-tl-none border border-orange-100'
            : 'bg-white rounded-tl-none'
        } ${hasMediaBlock ? 'p-1.5' : 'px-3 py-2'}`}
      >
        {/* Message tail */}
        <div
          className={`absolute top-0 w-0 h-0 ${
            isUser
              ? 'right-[-8px] border-l-[8px] border-l-[#DCF8C6] border-t-[8px] border-t-transparent'
              : isHumanReply
              ? 'left-[-8px] border-r-[8px] border-r-[#FFF3E0] border-t-[8px] border-t-transparent'
              : 'left-[-8px] border-r-[8px] border-r-white border-t-[8px] border-t-transparent'
          }`}
        />

        {/* Human agent label — show sender's first name */}
        {isHumanReply && (
          <div className="flex items-center gap-1 mb-1 pt-1 px-1">
            <UserCheck size={10} className="text-orange-500" />
            <span className="text-[10px] text-orange-500 font-semibold tracking-wide">
              {repliedByName || 'Agent'}
            </span>
          </div>
        )}

        {/* New attachment block (preferred) */}
        {attachment && <AttachmentBubble attachment={attachment} />}

        {/* Legacy mediaUrl fallback */}
        {!attachment && mediaUrl && (
          isImageUrl(mediaUrl) ? (
            <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={mediaUrl}
                alt="Media"
                className="w-full max-w-[300px] rounded-md object-cover cursor-pointer"
              />
            </a>
          ) : (
            <div className="px-2 pt-1">
              <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs flex items-center gap-1 hover:underline break-all">
                <ExternalLink size={12} /> {mediaUrl.length > 50 ? mediaUrl.slice(0, 50) + '...' : mediaUrl}
              </a>
            </div>
          )
        )}

        <div className={hasMediaBlock ? 'px-2 pt-1.5 pb-0.5' : ''}>
          {content && (
            <p dir="auto" className="text-sm text-gray-800 whitespace-pre-wrap break-words">{content}</p>
          )}

          {/* No delivery ticks: real pending/sent/read state needs the wamid
              pipeline (Phase 2). Never fake ticks — the old permanent blue
              CheckCheck sat on the guest's own messages. */}
          <div className={`flex items-center gap-1 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] text-gray-500">{formatTime(timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppMessage;
