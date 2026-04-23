import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Mic, Upload } from 'lucide-react';
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
  const [textareaHeight, setTextareaHeight] = useState(50);
  const { stagedFiles, addFile, removeFile, clearFiles } = useFileStaging();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(Math.max(textareaRef.current.scrollHeight, 50), 200);
      textareaRef.current.style.height = `${newHeight}px`;
      setTextareaHeight(newHeight);
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

  return (
    <div className="border-t border-border bg-transparent">
      <div className="px-4 py-4">
        <div className="space-y-3 max-w-3xl mx-auto">
          {stagedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {stagedFiles.map((file, index) => (
                <FileAttachmentPill
                  key={`${file.name}-${index}`}
                  file={file}
                  onRemove={() => removeFile(index)}
                />
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <div className="relative rounded-2xl bg-card/80 border border-border shadow-card-soft backdrop-blur transition-all focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/40">
                <Textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Sera anything…"
                  className="border-0 rounded-2xl resize-none bg-transparent px-4 py-3 text-foreground placeholder:text-muted-foreground focus:ring-0 focus:outline-none min-h-[50px] max-h-[200px] pr-20 overflow-y-auto"
                  disabled={isTyping}
                  style={{ height: `${textareaHeight}px` }}
                />
                <div
                  className="absolute right-3 flex items-center gap-1"
                  style={{
                    top: textareaHeight <= 50 ? '50%' : '14px',
                    transform: textareaHeight <= 50 ? 'translateY(-50%)' : 'none',
                  }}
                >
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 w-8 p-0">
                    <Mic size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 w-8 p-0"
                    onClick={triggerFileUpload}
                    disabled={isTyping}
                  >
                    <Upload size={16} />
                  </Button>
                </div>
              </div>
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={(!inputValue.trim() && stagedFiles.length === 0) || isTyping}
              className="rounded-2xl h-[50px] w-[50px] p-0 bg-primary-gradient text-primary-foreground glow-primary hover:scale-105 transition-transform disabled:opacity-40 disabled:hover:scale-100"
            >
              <Send size={18} />
            </Button>
          </div>
        </div>
      </div>

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
