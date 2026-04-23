import React from 'react';
import InputBar from './InputBar';
import twoSeasonsLogo from '@/assets/two-seasons-logo.png';

interface WelcomeScreenProps {
  inputValue: string;
  isTyping: boolean;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onFileUpload?: (file: File) => void;
}

const SUGGESTIONS = [
  "Show yesterday's WhatsApp conversations",
  'Compare our rates vs competitors',
  'Summarize latest guest reviews',
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
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 bg-transparent">
      <div className="text-center max-w-md mb-6">
        <div className="w-16 h-16 rounded-full bg-card border border-primary/30 glow-primary flex items-center justify-center overflow-hidden mx-auto mb-5">
          <img src={twoSeasonsLogo} alt="Two Seasons" className="w-12 h-12 object-contain" />
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onInputChange(s)}
              className="bg-card/60 border border-border hover:border-primary/50 hover:bg-primary/5 rounded-full px-3 py-1.5 text-xs text-foreground/80 transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-2xl">
        <InputBar
          inputValue={inputValue}
          isTyping={isTyping}
          onInputChange={onInputChange}
          onSendMessage={onSendMessage}
          onKeyPress={onKeyPress}
          onSendWithFiles={(message, files) => {
            if (files.length > 0) {
              files.forEach((file) => onFileUpload?.(file));
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

export default WelcomeScreen;
