import React, { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowUp, Mic, Paperclip, ChevronDown } from 'lucide-react';
import FileAttachmentPill from './FileAttachmentPill';
import { useFileStaging } from '@/hooks/useFileStaging';

interface InputBarProps {
  inputValue: string;
  isTyping: boolean;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  stagedFiles?: File[];
  onSendWithFiles?: (message: string, files: File[]) => void;
}

const InputBar: React.FC<InputBarProps> = ({
  inputValue,
  isTyping,
  onInputChange,
  onSendMessage,
  onSendWithFiles,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { stagedFiles, addFile, removeFile, clearFiles } = useFileStaging();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(Math.max(textareaRef.current.scrollHeight, 36), 160);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [inputValue]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) addFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendMessage = () => {
    if (stagedFiles.length > 0 && onSendWithFiles) {
      onSendWithFiles(inputValue, stagedFiles);
      clearFiles();
    } else {
      onSendMessage();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((inputValue.trim() || stagedFiles.length > 0) && !isTyping) {
        handleSendMessage();
      }
    }
  };

  const triggerFileUpload = () => fileInputRef.current?.click();
  const canSend = (inputValue.trim() || stagedFiles.length > 0) && !isTyping;

  return (
    <div className="bg-transparent px-3 pb-3 pt-2">
      {stagedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {stagedFiles.map((file, index) => (
            <FileAttachmentPill
              key={`${file.name}-${index}`}
              file={file}
              onRemove={() => removeFile(index)}
            />
          ))}
        </div>
      )}

      <div className="rounded-2xl bg-card/60 border border-border focus-within:border-primary/50 backdrop-blur transition-colors">
        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Sera a follow up question..."
          className="border-0 rounded-2xl resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none min-h-[36px] max-h-[160px] overflow-y-auto"
          disabled={isTyping}
        />

        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground bg-background/40 hover:bg-background/60 rounded-md px-2 py-1 transition-colors"
          >
            Sera
            <ChevronDown size={12} />
          </button>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={triggerFileUpload}
              disabled={isTyping}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-background/60"
            >
              <Paperclip size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-background/60"
            >
              <Mic size={14} />
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={!canSend}
              className="h-7 w-7 p-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              <ArrowUp size={14} />
            </Button>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/60 text-center mt-1.5">
        Powered by Two Seasons Data
      </p>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif"
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default InputBar;
