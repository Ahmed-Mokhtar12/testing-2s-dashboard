import React from 'react';

const TypingIndicator: React.FC = () => {
  return (
    <div className="flex items-center gap-2 pl-10 py-2">
      <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-muted-foreground">Reasoning…</span>
    </div>
  );
};

export default TypingIndicator;
