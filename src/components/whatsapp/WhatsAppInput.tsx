import React, { useRef, useState } from 'react';
import { Send, Smile, Plus, Mic } from 'lucide-react';
import EmojiPicker, { EmojiStyle, Categories, EmojiClickData } from 'emoji-picker-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface WhatsAppInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isHumanMode?: boolean;
}

const WhatsAppInput: React.FC<WhatsAppInputProps> = ({ onSend, disabled, isHumanMode }) => {
  const [message, setMessage] = useState('');
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<number>(0);

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

  const trackCursor = () => {
    if (inputRef.current) {
      cursorRef.current = inputRef.current.selectionStart ?? message.length;
    }
  };

  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji;
    const pos = cursorRef.current ?? message.length;
    const next = message.slice(0, pos) + emoji + message.slice(pos);
    setMessage(next);
    const newPos = pos + emoji.length;
    cursorRef.current = newPos;
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    });
  };

  return (
    <div className="bg-[#F7F8FA] px-4 py-2.5">
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <button
          type="button"
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-[#54656F] hover:bg-[#E9EDEF] transition-colors"
          aria-label="Attach"
          title="Attach"
        >
          <Plus size={24} strokeWidth={2.2} />
        </button>

        <div className="flex-1 flex items-center bg-white rounded-lg px-2 shadow-sm">
          <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`shrink-0 p-1.5 transition-colors ${
                  isEmojiOpen ? 'text-[#128C7E]' : 'text-[#54656F] hover:text-[#128C7E]'
                }`}
                aria-label="Emoji"
                title="Emoji"
              >
                <Smile size={22} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              className="p-0 border-0 bg-transparent shadow-none w-auto wa-emoji-popover"
            >
              <EmojiPicker
                onEmojiClick={handleEmojiSelect}
                emojiStyle={EmojiStyle.NATIVE}
                width={350}
                height={450}
                searchPlaceHolder="Search emoji"
                previewConfig={{ showPreview: false }}
                skinTonesDisabled={false}
                lazyLoadEmojis
                categories={[
                  { category: Categories.SUGGESTED, name: 'Recently Used' },
                  { category: Categories.SMILEYS_PEOPLE, name: 'Smileys & People' },
                  { category: Categories.ANIMALS_NATURE, name: 'Animals & Nature' },
                  { category: Categories.FOOD_DRINK, name: 'Food & Drink' },
                  { category: Categories.ACTIVITIES, name: 'Activities' },
                  { category: Categories.TRAVEL_PLACES, name: 'Travel & Places' },
                  { category: Categories.OBJECTS, name: 'Objects' },
                  { category: Categories.SYMBOLS, name: 'Symbols' },
                  { category: Categories.FLAGS, name: 'Flags' },
                ]}
              />
            </PopoverContent>
          </Popover>
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => { setMessage(e.target.value); trackCursor(); }}
            onKeyUp={trackCursor}
            onClick={trackCursor}
            onSelect={trackCursor}
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
