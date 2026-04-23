import React from 'react';
import { FileText, Image as ImageIcon, Camera } from 'lucide-react';

interface AttachmentMenuProps {
  onPickDocument: () => void;
  onPickMedia: () => void;
}

const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  iconBg: string;
  onClick?: () => void;
  disabled?: boolean;
  hint?: string;
}> = ({ icon, label, iconBg, onClick, disabled, hint }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F0F2F5] transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <span
      className={`w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0`}
      style={{ backgroundColor: iconBg }}
    >
      {icon}
    </span>
    <span className="flex-1">
      <span className="block text-[14px] text-[#111B21]">{label}</span>
      {hint && <span className="block text-[11px] text-[#667781]">{hint}</span>}
    </span>
  </button>
);

const AttachmentMenu: React.FC<AttachmentMenuProps> = ({ onPickDocument, onPickMedia }) => {
  return (
    <div className="bg-white rounded-lg shadow-lg py-2 min-w-[220px] border border-[#E9EDEF]">
      <MenuItem
        icon={<FileText size={18} />}
        label="Document"
        iconBg="#7F66FF"
        onClick={onPickDocument}
      />
      <MenuItem
        icon={<ImageIcon size={18} />}
        label="Photos & videos"
        iconBg="#007BFC"
        onClick={onPickMedia}
      />
      <MenuItem
        icon={<Camera size={18} />}
        label="Camera"
        iconBg="#FF2E74"
        disabled
        hint="Coming soon"
      />
    </div>
  );
};

export default AttachmentMenu;
