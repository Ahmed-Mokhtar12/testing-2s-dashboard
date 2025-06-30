
import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center max-w-3xl mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-[#C8A351] to-[#B8934A] rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
          <span className="text-white font-bold text-2xl">TS</span>
        </div>
        <h1 className="text-4xl font-light text-gray-900 mb-4">
          مرحباً بك في مستشار فندق Two Seasons الذكي
        </h1>
        <p className="text-xl text-gray-600 mb-6 leading-relaxed">
          مساعدك الذكي المتخصص في إدارة الفنادق، خدمات الضيوف، والاستشارات الاستراتيجية
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 text-sm">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="text-[#C8A351] font-semibold mb-2">📊 تحليل البيانات</div>
            <div className="text-gray-600">تحليل مراجعات الضيوف والمقاييس التشغيلية</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="text-[#C8A351] font-semibold mb-2">🎯 استشارات استراتيجية</div>
            <div className="text-gray-600">توصيات لتحسين الإيرادات وتجربة الضيوف</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="text-[#C8A351] font-semibold mb-2">🤖 دعم ذكي</div>
            <div className="text-gray-600">ردود فورية مدعومة ببيانات الفندق الحقيقية</div>
          </div>
        </div>
      </div>
      
      {/* Enhanced Input Area */}
      <div className="w-full max-w-4xl">
        <div className="flex items-end space-x-3 rtl:space-x-reverse">
          <div className="flex-1 relative">
            <div className="relative rounded-2xl border-2 border-gray-300 bg-white shadow-lg focus-within:border-[#C8A351] focus-within:ring-2 focus-within:ring-[#C8A351]/20 transition-all">
              <Input
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyPress={onKeyPress}
                placeholder="اسأل عن أي شيء متعلق بالفندق... مثل: كيف يمكن تحسين مراجعات الضيوف؟"
                className="border-0 rounded-2xl resize-none bg-transparent px-6 py-4 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none min-h-[60px] text-lg"
                disabled={isTyping}
                dir="rtl"
              />
              <div className="absolute left-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-[#C8A351] transition-colors">
                  <Mic size={18} />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-gray-400 hover:text-[#C8A351] transition-colors"
                  onClick={triggerFileUpload}
                  disabled={isTyping}
                >
                  <Upload size={18} />
                </Button>
              </div>
            </div>
          </div>
          <Button
            onClick={onSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="rounded-2xl px-8 py-4 bg-gradient-to-r from-[#C8A351] to-[#B8934A] hover:from-[#B8934A] hover:to-[#A8834A] text-white font-medium transition-all shadow-lg hover:shadow-xl transform hover:scale-105 min-h-[60px]"
          >
            {isTyping ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>جاري التفكير...</span>
              </div>
            ) : (
              <Send size={18} />
            )}
          </Button>
        </div>
        
        <div className="mt-4 text-center text-sm text-gray-500">
          💡 نصيحة: يمكنك السؤال عن تحليل المراجعات، تحسين العمليات، استراتيجيات التسويق، أو أي استفسار حول إدارة الفندق
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

export default WelcomeScreen;
