import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Mic, Upload } from 'lucide-react';
interface WelcomeScreenProps {
  inputValue: string;
  isTyping: boolean;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onFileUpload?: (file: File) => void;
}
const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  inputValue,
  isTyping,
  onInputChange,
  onSendMessage,
  onKeyPress,
  onFileUpload
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(60);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(Math.max(textareaRef.current.scrollHeight, 60), 200);
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
  return <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center max-w-3xl mb-8">
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg overflow-hidden">
          <img src="/lovable-uploads/30a459cd-3686-44d4-bdcc-cb6b4c388321.png" alt="Hotel Logo" className="w-12 h-12 object-contain" />
        </div>
        
        <h1 className="text-4xl font-light text-gray-900 mb-4">Welcome to Two Seasons Hotel AI Manager</h1>
        <p className="text-xl text-gray-600 mb-6 leading-relaxed">
      </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 text-sm">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="text-[#C8A351] font-semibold mb-2">📊 Data Analysis</div>
            <div className="text-gray-600">Analyze guest reviews and operational metrics</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="text-[#C8A351] font-semibold mb-2">🎯 Strategic Consulting</div>
            <div className="text-gray-600">Recommendations to improve revenue and guest experience</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="text-[#C8A351] font-semibold mb-2">🤖 Smart Support</div>
            <div className="text-gray-600">Instant responses powered by real hotel data</div>
          </div>
        </div>
      </div>
      
      
      <div className="w-full max-w-4xl">
        <div className="flex items-end space-x-3">
          <div className="flex-1 relative">
            <div className="relative rounded-2xl border-2 border-gray-300 bg-white shadow-lg focus-within:border-[#C8A351] focus-within:ring-2 focus-within:ring-[#C8A351]/20 transition-all">
              <Textarea 
                ref={textareaRef}
                value={inputValue} 
                onChange={e => onInputChange(e.target.value)} 
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about the hotel... like: How can we improve guest reviews? (Shift+Enter for new line)" 
                className="border-0 rounded-2xl resize-none bg-transparent px-6 py-4 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none min-h-[60px] max-h-[200px] text-lg pr-20 overflow-y-auto" 
                disabled={isTyping}
                style={{ height: `${textareaHeight}px` }}
              />
              <div className="absolute right-4 flex items-center gap-2" style={{ top: textareaHeight <= 60 ? '50%' : '16px', transform: textareaHeight <= 60 ? 'translateY(-50%)' : 'none' }}>
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-[#C8A351] transition-colors">
                  <Mic size={18} />
                </Button>
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-[#C8A351] transition-colors" onClick={triggerFileUpload} disabled={isTyping}>
                  <Upload size={18} />
                </Button>
              </div>
            </div>
          </div>
          <Button onClick={onSendMessage} disabled={!inputValue.trim() || isTyping} className="rounded-2xl px-8 py-4 bg-gradient-to-r from-[#C8A351] to-[#B8934A] hover:from-[#B8934A] hover:to-[#A8834A] text-white font-medium transition-all shadow-lg hover:shadow-xl transform hover:scale-105 min-h-[60px]">
            {isTyping ? <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Thinking...</span>
              </div> : <Send size={18} />}
          </Button>
        </div>
        
        <div className="mt-4 text-center text-sm text-gray-500">
          💡 Tip: You can ask about review analysis, operations improvement, marketing strategies, or any hotel management inquiry
        </div>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif" style={{
      display: 'none'
    }} />
    </div>;
};
export default WelcomeScreen;