import React from 'react';
import { FileText, Loader2, CheckCircle, X } from 'lucide-react';
import { ProcessingProgress } from '@/utils/clientSideDocumentProcessor';
import { cn } from '@/lib/utils';

interface DocumentProcessingProgressProps {
  progress: ProcessingProgress;
  fileName: string;
  onClose?: () => void;
}

const DocumentProcessingProgress: React.FC<DocumentProcessingProgressProps> = ({
  progress,
  fileName,
  onClose,
}) => {
  const getStageIcon = (stage: ProcessingProgress['stage']) => {
    switch (stage) {
      case 'extracting':
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case 'storing':
        return <Loader2 className="w-4 h-4 animate-spin text-accent" />;
      case 'indexing':
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-success" />;
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStageText = (stage: ProcessingProgress['stage']) => {
    switch (stage) {
      case 'extracting':
        return 'Extracting text';
      case 'storing':
        return 'Storing data';
      case 'indexing':
        return 'Indexing';
      case 'complete':
        return 'Complete';
      default:
        return 'Processing';
    }
  };

  const getProgressColor = (stage: ProcessingProgress['stage']) => {
    switch (stage) {
      case 'complete':
        return 'bg-success';
      default:
        return 'bg-primary';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 bg-card border border-border rounded-lg shadow-card-soft p-4 max-w-sm backdrop-blur">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-sm text-foreground truncate max-w-[180px]">
              {fileName}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {getStageIcon(progress.stage)}
              <span className="text-xs text-muted-foreground">
                {getStageText(progress.stage)}
              </span>
            </div>
          </div>
        </div>
        {progress.stage === 'complete' && onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{progress.message}</span>
          <span className="shrink-0 ml-2">{progress.progress}%</span>
        </div>

        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className={cn('h-2 rounded-full transition-all duration-300', getProgressColor(progress.stage))}
            style={{ width: `${progress.progress}%` }}
          />
        </div>

        {progress.stage === 'complete' && (
          <p className="text-xs text-success mt-2">
            ✓ Document processed successfully. You can now ask questions about it.
          </p>
        )}
      </div>
    </div>
  );
};

export default DocumentProcessingProgress;
