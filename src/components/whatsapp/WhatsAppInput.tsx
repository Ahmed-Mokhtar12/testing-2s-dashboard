import React, { useState } from 'react';
import { Send, Smile, Plus, Mic } from 'lucide-react';

interface WhatsAppInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isHumanMode?: boolean;
}

const WhatsAppInput: React.FC<WhatsAppInputProps> = ({ onSend, disabled, isHumanMode }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="bg-[#F7F8FA] px-4 py-2.5">
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        {/* Circular + button (WhatsApp Web style) */}
        <button
          type="button"
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-[#54656F] hover:bg-[#E9EDEF] transition-colors"
          aria-label="Attach"
          title="Attach"
        >
          <Plus size={24} strokeWidth={2.2} />
        </button>

        {/* Input pill with internal Emoji icon */}
        <div className="flex-1 flex items-center bg-white rounded-lg px-2 shadow-sm">
          <button
            type="button"
            className="shrink-0 p-1.5 text-[#54656F] hover:text-[#128C7E] transition-colors"
            aria-label="Emoji"
            title="Emoji"
          >
            <Smile size={22} />
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isHumanMode ? "Type a message to the customer..." : "Type a message"}
            disabled={disabled}
            className="flex-1 bg-transparent px-2 py-2.5 text-[15px] text-[#111B21] placeholder:text-[#667781] focus:outline-none disabled:opacity-50"
          />
        </div>

        {message.trim() ? (
          <button
            type="submit"
            disabled={disabled}
            className="shrink-0 w-10 h-10 flex items-center justify-center bg-[#128C7E] text-white rounded-full hover:bg-[#075E54] transition-colors disabled:opacity-50"
            aria-label="Send message"
          >
            <Send size={20} />
          </button>
        ) : (
          <button
            type="button"
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-[#54656F] hover:bg-[#E9EDEF] transition-colors"
            aria-label="Voice message"
            title="Voice message"
          >
            <Mic size={22} />
          </button>
        )}
      </form>
    </div>
  );
};

export default WhatsAppInput;
