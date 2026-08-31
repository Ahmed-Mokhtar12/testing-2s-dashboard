import React, { useEffect, useRef, useState } from 'react';
import { Send, Smile, Plus, Mic } from 'lucide-react';
import EmojiPicker, { EmojiStyle, Categories, EmojiClickData } from 'emoji-picker-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import AttachmentMenu from './AttachmentMenu';
import AttachmentPreview from './AttachmentPreview';
import { useWhatsAppAttachment, validateFile, type StagedAttachment, type UploadedAttachment } from '@/hooks/useWhatsAppAttachment';
import { toast } from '@/hooks/use-toast';

interface WhatsAppInputProps {
  onSend: (message: string, attachment?: UploadedAttachment) => void;
  disabled?: boolean;
  isHumanMode?: boolean;
  senderNumber: string;
}

const WhatsAppInput: React.FC<WhatsAppInputProps> = ({ onSend, disabled, isHumanMode, senderNumber }) => {
  const [message, setMessage] = useState('');
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [staged, setStaged] = useState<StagedAttachment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<number>(0);

  const { uploadAttachment, isUploading } = useWhatsAppAttachment();

  const clearStaged = () => {
    if (staged?.previewUrl) URL.revokeObjectURL(staged.previewUrl);
    setStaged(null);
  };

  // The component is remounted per conversation (key={senderNumber}); revoke any
  // staged preview object URL on unmount so switching chats doesn't leak it.
  const stagedRef = useRef<StagedAttachment | null>(null);
  stagedRef.current = staged;
  useEffect(() => {
    return () => {
      if (stagedRef.current?.previewUrl) URL.revokeObjectURL(stagedRef.current.previewUrl);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || isUploading) return;
    if (!message.trim() && !staged) return;

    let uploaded: UploadedAttachment | undefined;
    if (staged) {
      const result = await uploadAttachment(staged.file, senderNumber);
      if (!result) return; // upload failed; keep staged so user can retry
      uploaded = result;
    }

    onSend(message.trim(), uploaded);
    setMessage('');
    clearStaged();
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

  const handleFileSelected = (file: File) => {
    const v = validateFile(file);
    if (!v.ok || !v.kind) {
      toast({ title: 'Cannot attach file', description: v.error, variant: 'destructive' });
      return;
    }
    const previewUrl = v.kind === 'image' ? URL.createObjectURL(file) : undefined;
    if (staged?.previewUrl) URL.revokeObjectURL(staged.previewUrl);
    setStaged({ file, kind: v.kind, previewUrl });
  };

  const onDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelected(f);
    e.target.value = '';
  };

  const onMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelected(f);
    e.target.value = '';
  };

  const canSend = (message.trim().length > 0 || !!staged) && !isUploading;

  return (
    <div className="bg-[#F7F8FA] px-4 py-2.5">
      {/* Hidden file inputs */}
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv"
        className="hidden"
        onChange={onDocChange}
      />
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime"
        className="hidden"
        onChange={onMediaChange}
      />

      {staged && (
        <AttachmentPreview attachment={staged} onRemove={clearStaged} />
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <Popover open={isAttachOpen} onOpenChange={setIsAttachOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                isAttachOpen ? 'text-[#128C7E] bg-[#E9EDEF]' : 'text-[#54656F] hover:bg-[#E9EDEF]'
              }`}
              aria-label="Attach"
              title="Attach"
            >
              <Plus size={24} strokeWidth={2.2} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={8}
            className="p-0 border-0 bg-transparent shadow-none w-auto"
          >
            <AttachmentMenu
              onPickDocument={() => {
                setIsAttachOpen(false);
                docInputRef.current?.click();
              }}
              onPickMedia={() => {
                setIsAttachOpen(false);
                mediaInputRef.current?.click();
              }}
            />
          </PopoverContent>
        </Popover>

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
            dir="auto"
            type="text"
            value={message}
            onChange={(e) => { setMessage(e.target.value); trackCursor(); }}
            onKeyUp={trackCursor}
            onClick={trackCursor}
            onSelect={trackCursor}
            onKeyDown={handleKeyDown}
            placeholder={
              isUploading
                ? 'Uploading...'
                : staged
                ? 'Add a caption (optional)'
                : isHumanMode
                ? 'Type a message to the customer...'
                : 'Type a message'
            }
            disabled={disabled || isUploading}
            className="flex-1 bg-transparent px-2 py-2.5 text-[15px] text-[#111B21] placeholder:text-[#667781] focus:outline-none disabled:opacity-50"
          />
        </div>

        {canSend ? (
          <button
            type="submit"
            disabled={disabled || isUploading}
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
