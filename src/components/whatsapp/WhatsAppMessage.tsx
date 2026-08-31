import React from 'react';
import { ExternalLink, UserCheck } from 'lucide-react';
import AttachmentBubble, { AttachmentBubbleData } from './AttachmentBubble';
import { parseWhatsAppText, type WaToken } from '@/lib/whatsappFormat';

// Token tree -> React nodes (tree stays data; nothing goes through innerHTML).
const renderTokens = (tokens: WaToken[], keyPrefix = ''): React.ReactNode[] =>
  tokens.map((t, i) => {
    const key = `${keyPrefix}${i}`;
    switch (t.kind) {
      case 'text':
        return <React.Fragment key={key}>{t.text}</React.Fragment>;
      case 'link':
        return (
          <a
            key={key}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#027EB5] underline break-all"
          >
            {t.text}
          </a>
        );
      case 'mono':
        return (
          <code key={key} className="font-mono text-[13px] bg-black/5 rounded px-1">
            {t.text}
          </code>
        );
      case 'bold':
        return (
          <strong key={key} className="font-semibold">
            {renderTokens(t.children, `${key}-`)}
          </strong>
        );
      case 'italic':
        return <em key={key}>{renderTokens(t.children, `${key}-`)}</em>;
      case 'strike':
        return <s key={key}>{renderTokens(t.children, `${key}-`)}</s>;
    }
  });

interface WhatsAppMessageProps {
  content: string;
  isUser: boolean;
  isHumanReply?: boolean;
  timestamp: Date;
  mediaUrl?: string;
  attachment?: AttachmentBubbleData;
  repliedByName?: string;
  /** First bubble of a same-sender run gets the tail + squared corner and a
      larger gap; followers sit tight beneath it (WhatsApp's run rhythm). */
  isFirstOfGroup?: boolean;
}

const isImageUrl = (url: string): boolean => {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
};

const WhatsAppMessage: React.FC<WhatsAppMessageProps> = ({ content, isUser, isHumanReply, timestamp, mediaUrl, attachment, repliedByName, isFirstOfGroup = true }) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const hasMediaBlock = !!attachment || !!mediaUrl;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${isFirstOfGroup ? 'mt-2' : 'mt-0.5'}`}>
      <div
        className={`max-w-[65%] rounded-lg shadow-sm relative ${
          isFirstOfGroup ? (isUser ? 'rounded-tr-none' : 'rounded-tl-none') : ''
        } ${
          isUser
            ? 'bg-[#D9FDD3]'
            : isHumanReply
            ? 'bg-[#FFF3E0] border border-orange-100'
            : 'bg-white'
        } ${hasMediaBlock ? 'p-1.5' : 'px-3 py-2'}`}
      >
        {/* Message tail — first bubble of a run only */}
        {isFirstOfGroup && (
          <div
            className={`absolute top-0 w-0 h-0 ${
              isUser
                ? 'right-[-8px] border-l-[8px] border-l-[#D9FDD3] border-t-[8px] border-t-transparent'
                : isHumanReply
                ? 'left-[-8px] border-r-[8px] border-r-[#FFF3E0] border-t-[8px] border-t-transparent'
                : 'left-[-8px] border-r-[8px] border-r-white border-t-[8px] border-t-transparent'
            }`}
          />
        )}

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
            <p dir="auto" className="text-sm text-gray-800 whitespace-pre-wrap break-words">
              {renderTokens(parseWhatsAppText(content))}
            </p>
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
