import React, { useState } from 'react';
import { Send, Smile, Paperclip, Mic } from 'lucide-react';

interface WhatsAppInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const WhatsAppInput: React.FC<WhatsAppInputProps> = ({ onSend, disabled }) => {
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
    <div className="bg-[#F0F0F0] px-4 py-3">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <button
          type="button"
          className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
          aria-label="Emoji"
        >
          <Smile size={24} />
        </button>
        
        <button
          type="button"
          className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
          aria-label="Attach file"
        >
          <Paperclip size={24} />
        </button>

        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message"
          disabled={disabled}
          className="flex-1 bg-white rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#128C7E]/20 disabled:opacity-50"
        />

        {message.trim() ? (
          <button
            type="submit"
            disabled={disabled}
            className="p-2 bg-[#128C7E] text-white rounded-full hover:bg-[#075E54] transition-colors disabled:opacity-50"
            aria-label="Send message"
          >
            <Send size={20} />
          </button>
        ) : (
          <button
            type="button"
            className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
            aria-label="Voice message"
          >
            <Mic size={24} />
          </button>
        )}
      </form>
    </div>
  );
};

export default WhatsAppInput;
