import React from 'react';
import { Sparkles } from 'lucide-react';
import InputBar from './InputBar';

interface WelcomeScreenProps {
  inputValue: string;
  isTyping: boolean;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onFileUpload?: (file: File) => void;
}

const SUGGESTIONS = [
  "Yesterday's WhatsApp conversations",
  'Rate vs competitors',
  'Latest guest reviews',
];

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  inputValue,
  isTyping,
  onInputChange,
  onSendMessage,
  onKeyPress,
  onFileUpload,
}) => {
  return (
    <div className="flex-1 flex flex-col bg-transparent min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles size={14} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-foreground leading-snug">Hi, I'm Sera.</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Your hotel data consultant. Ask me about bookings, reviews, competitors, or guests.
            </p>
          </div>
        </div>

        <div className="pl-10 flex flex-col gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onInputChange(s)}
              className="text-xs text-muted-foreground hover:text-foreground border border-border/60 hover:border-primary/40 rounded-lg px-3 py-2 text-left w-full transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="shrink-0">
        <InputBar
          inputValue={inputValue}
          isTyping={isTyping}
          onInputChange={onInputChange}
          onSendMessage={onSendMessage}
          onKeyPress={onKeyPress}
          onSendWithFiles={(message, files) => {
            if (files.length > 0) files.forEach((file) => onFileUpload?.(file));
            if (message.trim()) onSendMessage();
          }}
        />
      </div>
    </div>
  );
};

export default WelcomeScreen;
