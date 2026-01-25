import React from 'react';
import WhatsAppHeader from '@/components/whatsapp/WhatsAppHeader';
import WhatsAppChat from '@/components/whatsapp/WhatsAppChat';

const WhatsAppLanding: React.FC = () => {
  return (
    <div className="h-screen flex flex-col bg-[#E5DDD5]">
      <WhatsAppHeader />
      <WhatsAppChat />
    </div>
  );
};

export default WhatsAppLanding;
