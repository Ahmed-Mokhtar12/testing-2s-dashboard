import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const WhatsAppHeader: React.FC = () => {
  return (
    <div className="bg-[#128C7E] text-white px-4 py-3 flex items-center gap-3 shadow-md">
      <Link to="/" className="p-1 hover:bg-white/10 rounded-full transition-colors">
        <ArrowLeft size={24} />
      </Link>
      
      <div className="w-10 h-10 bg-gradient-to-br from-[#C8A351] to-[#B8934A] rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-white font-bold text-sm">TS</span>
      </div>
      
      <div className="flex-1 min-w-0">
        <h1 className="font-semibold text-base truncate">Two Seasons Hotel Dubai</h1>
        <p className="text-xs text-white/80 flex items-center gap-1">
          <span className="w-2 h-2 bg-green-400 rounded-full"></span>
          Online
        </p>
      </div>
    </div>
  );
};

export default WhatsAppHeader;
