import React from 'react';
import { X, FileText, Image, File } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileAttachmentPillProps {
  file: File;
  onRemove: () => void;
}

const FileAttachmentPill: React.FC<FileAttachmentPillProps> = ({ file, onRemove }) => {
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image size={14} />;
    if (type.includes('pdf') || type.includes('document')) return <FileText size={14} />;
    return <File size={14} />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1.5 text-sm border">
      {getFileIcon(file.type)}
      <span className="truncate max-w-32">{file.name}</span>
      <span className="text-gray-500 text-xs">({formatFileSize(file.size)})</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-4 w-4 p-0 hover:bg-gray-200 rounded-full"
        onClick={onRemove}
      >
        <X size={12} />
      </Button>
    </div>
  );
};

export default FileAttachmentPill;