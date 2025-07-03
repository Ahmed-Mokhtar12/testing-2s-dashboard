
export interface ActionData {
  type: 'email' | 'sms' | 'whatsapp';
  recipient: string;
  subject?: string;
  message: string;
  phoneNumber?: string;
}

export interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  fileName?: string;
  fileType?: string;
  actionData?: ActionData;
  actionStatus?: 'pending_confirmation' | 'confirmed' | 'executing' | 'completed' | 'failed';
  hasAction?: boolean;
}
