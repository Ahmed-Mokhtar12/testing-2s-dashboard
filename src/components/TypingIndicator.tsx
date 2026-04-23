import React from 'react';
import twoSeasonsLogo from '@/assets/two-seasons-logo.png';

const TypingIndicator: React.FC = () => {
  return (
    <div className="flex justify-start mb-6">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-card border border-primary/40 glow-primary overflow-hidden flex items-center justify-center flex-shrink-0">
          <img src={twoSeasonsLogo} alt="Sera" className="w-6 h-6 object-contain" />
        </div>
        <div className="bg-card border border-border rounded-2xl rounded-tl-md px-4 py-3 shadow-card-soft">
          <div className="flex items-center gap-2">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-primary/70 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="text-xs text-muted-foreground ml-1">Sera is thinking…</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
