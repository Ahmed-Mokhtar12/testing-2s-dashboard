import React from 'react';
import { X, FileText, Film } from 'lucide-react';
import type { StagedAttachment } from '@/hooks/useWhatsAppAttachment';

interface AttachmentPreviewProps {
  attachment: StagedAttachment;
  onRemove: () => void;
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({ attachment, onRemove }) => {
  const { file, kind, previewUrl } = attachment;

  return (
    <div className="bg-white border border-[#E9EDEF] rounded-lg p-2 mb-2 flex items-center gap-3 shadow-sm">
      {kind === 'image' && previewUrl ? (
        <img src={previewUrl} alt={file.name} className="w-12 h-12 rounded object-cover shrink-0" />
      ) : kind === 'video' ? (
        <div className="w-12 h-12 rounded bg-[#F0F2F5] flex items-center justify-center shrink-0">
          <Film size={22} className="text-[#54656F]" />
        </div>
      ) : (
        <div className="w-12 h-12 rounded bg-[#F0F2F5] flex items-center justify-center shrink-0">
          <FileText size={22} className="text-[#54656F]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-[#111B21] truncate">{file.name}</p>
        <p className="text-[11px] text-[#667781]">{formatSize(file.size)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 w-8 h-8 rounded-full hover:bg-[#F0F2F5] flex items-center justify-center text-[#54656F] transition-colors"
        aria-label="Remove attachment"
      >
        <X size={18} />
      </button>
    </div>
  );
};

export default AttachmentPreview;
