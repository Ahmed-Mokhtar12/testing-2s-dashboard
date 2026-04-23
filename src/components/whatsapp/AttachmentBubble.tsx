import React from 'react';
import { FileText, Download, FileSpreadsheet, FileType, File as FileIcon } from 'lucide-react';
import type { AttachmentKind } from '@/hooks/useWhatsAppAttachment';

export interface AttachmentBubbleData {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
}

interface AttachmentBubbleProps {
  attachment: AttachmentBubbleData;
}

const formatSize = (bytes: number): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getDocIcon = (mime: string, filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (mime.includes('pdf') || ext === 'pdf') {
    return { Icon: FileType, color: '#E53935', label: 'PDF' };
  }
  if (mime.includes('sheet') || mime.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) {
    return { Icon: FileSpreadsheet, color: '#2E7D32', label: ext.toUpperCase() || 'XLS' };
  }
  if (mime.includes('word') || ['doc', 'docx'].includes(ext)) {
    return { Icon: FileText, color: '#1565C0', label: ext.toUpperCase() || 'DOC' };
  }
  if (mime.includes('presentation') || ['ppt', 'pptx'].includes(ext)) {
    return { Icon: FileText, color: '#EF6C00', label: ext.toUpperCase() || 'PPT' };
  }
  return { Icon: FileIcon, color: '#54656F', label: ext.toUpperCase() || 'FILE' };
};

const AttachmentBubble: React.FC<AttachmentBubbleProps> = ({ attachment }) => {
  const { url, filename, mimeType, size, kind } = attachment;

  if (kind === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={url}
          alt={filename}
          className="w-full max-w-[300px] rounded-md object-cover cursor-pointer"
        />
      </a>
    );
  }

  if (kind === 'video') {
    return (
      <video
        src={url}
        controls
        className="w-full max-w-[300px] rounded-md"
      />
    );
  }

  // document
  const { Icon, color, label } = getDocIcon(mimeType, filename);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={filename}
      className="flex items-center gap-3 bg-white/60 hover:bg-white rounded-md p-2 transition-colors min-w-[240px] max-w-[320px]"
    >
      <div
        className="w-10 h-12 rounded flex items-center justify-center text-white text-[10px] font-bold shrink-0 relative"
        style={{ backgroundColor: color }}
      >
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-[#111B21] truncate font-medium">{filename}</p>
        <p className="text-[11px] text-[#667781]">
          {size ? formatSize(size) : ''} {label && size ? '·' : ''} {label}
        </p>
      </div>
      <Download size={18} className="text-[#54656F] shrink-0" />
    </a>
  );
};

export default AttachmentBubble;
