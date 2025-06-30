
import React from 'react';

const TypingIndicator: React.FC = () => {
  return (
    <div className="flex justify-start mb-6">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-[#C8A351] to-[#B8934A] rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-xs">TS</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-[#C8A351] rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-[#C8A351] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-[#C8A351] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="text-sm text-gray-500 mr-2">المستشار يفكر...</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
