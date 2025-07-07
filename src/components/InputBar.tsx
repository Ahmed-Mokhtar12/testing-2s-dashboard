
import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Mic, Upload } from 'lucide-react';

interface InputBarProps {
  inputValue: string;
  isTyping: boolean;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onFileUpload?: (file: File) => void;
}

const InputBar: React.FC<InputBarProps> = ({
  inputValue,
  isTyping,
  onInputChange,
  onSendMessage,
  onKeyPress,
  onFileUpload
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(50);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(Math.max(textareaRef.current.scrollHeight, 50), 200);
      textareaRef.current.style.height = `${newHeight}px`;
      setTextareaHeight(newHeight);
    }
  }, [inputValue]);

  // Handle key presses for ChatGPT-style behavior
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isTyping) {
        onSendMessage();
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onFileUpload) {
      onFileUpload(file);
    }
    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="border-t bg-white">
      <div className="px-4 py-4">
        <div className="flex items-end space-x-3 max-w-3xl mx-auto">
          <div className="flex-1 relative">
            <div className="relative rounded-2xl border border-gray-300 bg-white shadow-sm focus-within:border-[#C8A351] focus-within:ring-1 focus-within:ring-[#C8A351]">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask something... (Shift+Enter for new line)"
                className="border-0 rounded-2xl resize-none bg-transparent px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none min-h-[50px] max-h-[200px] pr-20 overflow-y-auto"
                disabled={isTyping}
                style={{ height: `${textareaHeight}px` }}
              />
              <div className="absolute right-3 flex items-center gap-2" style={{ top: textareaHeight <= 50 ? '50%' : '16px', transform: textareaHeight <= 50 ? 'translateY(-50%)' : 'none' }}>
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                  <Mic size={16} />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-gray-400 hover:text-gray-600"
                  onClick={triggerFileUpload}
                  disabled={isTyping}
                >
                  <Upload size={16} />
                </Button>
              </div>
            </div>
          </div>
          <Button
            onClick={onSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="rounded-2xl px-6 py-3 bg-[#C8A351] hover:bg-[#B8934A] text-white font-medium transition-colors"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
      
      {/* Hidden file input */}
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
