import React from 'react';
import { Progress } from '@/components/ui/progress';
import { FileText, Loader2, CheckCircle } from 'lucide-react';
import { ProcessingProgress } from '@/utils/clientSideDocumentProcessor';

interface DocumentProcessingProgressProps {
  progress: ProcessingProgress;
  fileName: string;
  onClose?: () => void;
}

const DocumentProcessingProgress: React.FC<DocumentProcessingProgressProps> = ({
  progress,
  fileName,
  onClose
}) => {
  const getStageIcon = (stage: ProcessingProgress['stage']) => {
    switch (stage) {
      case 'extracting':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'storing':
        return <Loader2 className="w-4 h-4 animate-spin text-orange-500" />;
      case 'indexing':
        return <Loader2 className="w-4 h-4 animate-spin text-purple-500" />;
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStageText = (stage: ProcessingProgress['stage']) => {
    switch (stage) {
      case 'extracting':
        return 'استخراج النص';
      case 'storing':
        return 'حفظ البيانات';
      case 'indexing':
        return 'الفهرسة';
      case 'complete':
        return 'مكتمل';
      default:
        return 'معالجة';
    }
  };

  const getProgressColor = (stage: ProcessingProgress['stage']) => {
    switch (stage) {
      case 'extracting':
        return 'bg-blue-500';
      case 'storing':
        return 'bg-orange-500';
      case 'indexing':
        return 'bg-purple-500';
      case 'complete':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-600" />
          <div>
            <p className="font-medium text-sm text-gray-900 truncate max-w-32">
              {fileName}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {getStageIcon(progress.stage)}
              <span className="text-xs text-gray-600">
                {getStageText(progress.stage)}
              </span>
            </div>
          </div>
        </div>
        {progress.stage === 'complete' && onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ×
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>{progress.message}</span>
          <span>{progress.progress}%</span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(progress.stage)}`}
            style={{ width: `${progress.progress}%` }}
          />
        </div>

        {progress.stage === 'complete' && (
          <p className="text-xs text-green-600 mt-2">
            ✅ تم معالجة المستند بنجاح! يمكنك الآن طرح أسئلة حوله.
          </p>
        )}
      </div>
    </div>
  );
};

export default DocumentProcessingProgress;