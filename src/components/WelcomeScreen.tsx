import React from 'react';
import InputBar from './InputBar';

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
        <InputBar
          inputValue={inputValue}
          isTyping={isTyping}
          onInputChange={onInputChange}
          onSendMessage={onSendMessage}
          onKeyPress={onKeyPress}
          onSendWithFiles={(message, files) => {
            // Handle files with message
            if (files.length > 0) {
              // Process files one by one for now
              files.forEach(file => onFileUpload?.(file));
            }
            if (message.trim()) {
              onSendMessage();
            }
          }}
        />
        
        <div className="mt-4 text-center text-sm text-gray-500">
          💡 Tip: You can ask about review analysis, operations improvement, marketing strategies, or any hotel management inquiry. You can also attach documents!
        </div>
      </div>
    </div>;
};
export default WelcomeScreen;