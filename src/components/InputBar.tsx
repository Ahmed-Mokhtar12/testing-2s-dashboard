
import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
              <Input
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyPress={onKeyPress}
                placeholder="Ask something..."
                className="border-0 rounded-2xl resize-none bg-transparent px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none min-h-[50px] pr-20"
                disabled={isTyping}
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
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
