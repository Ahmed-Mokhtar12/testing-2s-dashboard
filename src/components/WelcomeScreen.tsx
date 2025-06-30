
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Mic, Upload } from 'lucide-react';

interface WelcomeScreenProps {
  inputValue: string;
  isTyping: boolean;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  inputValue,
  isTyping,
  onInputChange,
  onSendMessage,
  onKeyPress
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 bg-gray-50">
      <div className="text-center max-w-2xl mb-8">
        <div className="w-16 h-16 bg-[#C8A351] rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-xl">TS</span>
        </div>
        <h2 className="text-3xl font-light text-gray-900 mb-4">
          Welcome to Two Seasons GPT
        </h2>
        <p className="text-lg text-gray-600 mb-8">
          Your intelligent assistant for hotel services, reservations, and inquiries
        </p>
      </div>
      
      {/* Centered Input Area */}
      <div className="w-full max-w-3xl">
        <div className="flex items-end space-x-3">
          <div className="flex-1 relative">
            <div className="relative rounded-2xl border border-gray-300 bg-white shadow-sm focus-within:border-[#C8A351] focus-within:ring-1 focus-within:ring-[#C8A351]">
              <Input
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyPress={onKeyPress}
                placeholder="Ask something..."
                className="border-0 rounded-2xl resize-none bg-transparent px-4 py-3 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none min-h-[50px]"
                disabled={isTyping}
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                  <Mic size={16} />
                </Button>
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
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
    </div>
  );
};

export default WelcomeScreen;
