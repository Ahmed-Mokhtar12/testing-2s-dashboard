import React from 'react';
import twoSeasonsLogo from '@/assets/two-seasons-logo.png';

// Shown in the conversation area when no chat is selected — previously that
// rendered a broken-looking panel (blank avatar, "+" title, error toast).
// Mirrors WhatsApp Web's hero placeholder: light panel, centered logomark,
// green base border.
const WhatsAppEmptyState: React.FC = () => (
  <div className="flex flex-col h-full w-full items-center justify-center bg-[#F0F2F5] border-b-[6px] border-[#25D366] text-center px-8">
    <img
      src={twoSeasonsLogo}
      alt=""
      className="w-24 h-24 object-contain opacity-80 mb-6"
    />
    <h2 className="text-[28px] font-light text-[#41525D]">Two Seasons WhatsApp</h2>
    <p className="text-sm text-[#667781] mt-3 max-w-md">
      Select a conversation from the list to view messages and reply to guests.
    </p>
  </div>
);

export default WhatsAppEmptyState;
