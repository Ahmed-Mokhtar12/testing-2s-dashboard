import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { UploadedAttachment } from './useWhatsAppAttachment';

export interface WhatsAppMessage {
  id: string;
  content: string;
  isUser: boolean;
  isHumanReply?: boolean;
  timestamp: Date;
  mediaUrl?: string;
  attachment?: UploadedAttachment;
}

// Get or create persistent sender number
const getSenderNumber = () => {
  const stored = localStorage.getItem('whatsapp_sender_number');
  if (stored) return stored;
  return '971505913426';
};

const saveSenderNumber = (number: string) => {
  localStorage.setItem('whatsapp_sender_number', number);
};

export const useWhatsAppChat = () => {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [senderNumber, setSenderNumber] = useState(getSenderNumber);
  const [availableNumbers, setAvailableNumbers] = useState<string[]>([]);
  const [isHumanControlled, setIsHumanControlled] = useState(false);
  const [isTogglingControl, setIsTogglingControl] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Load available sender numbers
  useEffect(() => {
    const loadNumbers = async () => {
      const { data, error } = await supabase
        .from('Chat History')
        .select('"Sender Number"')
        .not('Sender Number', 'is', null);
      
      if (data && !error) {
        const uniqueNumbers = [...new Set(data.map(d => d['Sender Number']).filter(Boolean))] as string[];
        setAvailableNumbers(uniqueNumbers);
      }
    };
    loadNumbers();
  }, []);

  // Load conversation history on mount or when sender changes
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const { data, error } = await supabase
          .from('Chat History')
          .select('*')
          .eq('Sender Number', senderNumber)
          .eq('is_archived', false)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error loading chat history:', error);
          return;
        }

        if (data && data.length > 0) {
          const historyMessages: WhatsAppMessage[] = [];
          
          // Check if the latest record has human_controlled true
          const latestRecord = data[data.length - 1];
          setIsHumanControlled(latestRecord.is_human_controlled ?? false);

          data.forEach((chat) => {
            // Extract attachment / media URL from Media column
            let mediaUrl: string | undefined;
            let attachment: UploadedAttachment | undefined;
            if (chat['Media']) {
              if (typeof chat['Media'] === 'string') {
                mediaUrl = chat['Media'];
              } else if (typeof chat['Media'] === 'object' && chat['Media'] !== null) {
                const m = chat['Media'] as Record<string, unknown>;
                const url = (m.url || m.link || m.src) as string | undefined;
                if (url && typeof m.kind === 'string') {
                  attachment = {
                    url,
                    filename: (m.filename as string) || 'file',
                    mimeType: (m.mimeType as string) || '',
                    size: (m.size as number) || 0,
                    kind: m.kind as UploadedAttachment['kind'],
                  };
                } else {
                  mediaUrl = url;
                }
              }
            }

            if (chat['Sender Message']) {
              historyMessages.push({
                id: `user-${chat.id}`,
                content: chat['Sender Message'],
                isUser: true,
                timestamp: new Date(chat.created_at),
                mediaUrl,
                attachment,
              });
            }

            // Show human_reply if it exists
            if (chat['human_reply']) {
              historyMessages.push({
                id: `human-${chat.id}`,
                content: chat['human_reply'],
                isUser: false,
                isHumanReply: true,
                timestamp: new Date(chat.created_at),
              });
            } else if (chat['Ai Reply']) {
              historyMessages.push({
                id: `ai-${chat.id}`,
                content: chat['Ai Reply'],
                isUser: false,
                isHumanReply: false,
                timestamp: new Date(chat.created_at),
              });
            }
          });
          setMessages(historyMessages);
        } else {
          setMessages([]);
          setIsHumanControlled(false);
        }
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [senderNumber]);

  // Realtime subscription for the active conversation
  useEffect(() => {
    // Unsubscribe previous channel if it exists
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`whatsapp-chat-${senderNumber}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'Chat History',
          filter: `Sender Number=eq.${senderNumber}`,
        },
        (payload) => {
          const chat = payload.new as Record<string, unknown>;

          // Extract attachment / media URL
          let mediaUrl: string | undefined;
          let attachment: UploadedAttachment | undefined;
          if (chat['Media']) {
            if (typeof chat['Media'] === 'string') {
              mediaUrl = chat['Media'] as string;
            } else if (typeof chat['Media'] === 'object' && chat['Media'] !== null) {
              const m = chat['Media'] as Record<string, unknown>;
              const url = (m.url || m.link || m.src) as string | undefined;
              if (url && typeof m.kind === 'string') {
                attachment = {
                  url,
                  filename: (m.filename as string) || 'file',
                  mimeType: (m.mimeType as string) || '',
                  size: (m.size as number) || 0,
                  kind: m.kind as UploadedAttachment['kind'],
                };
              } else {
                mediaUrl = url;
              }
            }
          }

          const newMessages: WhatsAppMessage[] = [];
          const timestamp = new Date(chat['created_at'] as string);
          const id = chat['id'] as number;

          if (chat['Sender Message']) {
            newMessages.push({
              id: `user-${id}`,
              content: chat['Sender Message'] as string,
              isUser: true,
              timestamp,
              mediaUrl,
              attachment,
            });
          }

          if (chat['human_reply']) {
            newMessages.push({
              id: `human-${id}`,
              content: chat['human_reply'] as string,
              isUser: false,
              isHumanReply: true,
              timestamp,
            });
          } else if (chat['Ai Reply']) {
            newMessages.push({
              id: `ai-${id}`,
              content: chat['Ai Reply'] as string,
              isUser: false,
              isHumanReply: false,
              timestamp,
            });
          }

          if (newMessages.length > 0) {
            setMessages((prev) => {
              // Deduplicate by id
              const existingIds = new Set(prev.map((m) => m.id));
              const fresh = newMessages.filter((m) => !existingIds.has(m.id));
              return fresh.length > 0 ? [...prev, ...fresh] : prev;
            });
          }

          // Update human control state if changed
          if (typeof chat['is_human_controlled'] === 'boolean') {
            setIsHumanControlled(chat['is_human_controlled'] as boolean);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [senderNumber]);

  const changeSenderNumber = useCallback((number: string) => {
    saveSenderNumber(number);
    setSenderNumber(number);
  }, []);

  // Toggle human takeover mode
  const toggleHumanControl = useCallback(async () => {
    setIsTogglingControl(true);
    const newState = !isHumanControlled;
    
    try {
      const { error } = await supabase.functions.invoke('whatsapp-send-message', {
        body: {
          action: newState ? 'takeover' : 'release',
          recipientNumber: senderNumber,
        },
      });

      if (error) throw error;
      setIsHumanControlled(newState);
    } catch (err) {
      console.error('Error toggling human control:', err);
    } finally {
      setIsTogglingControl(false);
    }
  }, [isHumanControlled, senderNumber]);

  const sendMessage = useCallback(async (content: string, attachment?: UploadedAttachment) => {
    // Pre-flight: if AI mode in UI, verify live human-control status BEFORE adding the outgoing bubble.
    // If human control is active server-side, show guidance instead of attempting to send.
    if (!isHumanControlled) {
      try {
        const { data: statusData } = await supabase.functions.invoke('whatsapp-control-status', {
          body: { senderNumber },
        });
        if (statusData?.isHumanControlled) {
          const guidance: WhatsAppMessage = {
            id: `guard-${Date.now()}`,
            content:
              '⚠️ The AI is currently handling this conversation. Please click the **Take Over** button at the top to start replying to the guest manually.\n\n⚠️ الذكاء الاصطناعي يدير هذه المحادثة حالياً. اضغط زر **Take Over** في الأعلى للرد على الضيف يدوياً.',
            isUser: false,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, guidance]);
          setIsHumanControlled(true);
          return;
        }
      } catch (preflightErr) {
        console.warn('Pre-flight control-status check failed, proceeding:', preflightErr);
      }
    }

    // Add outgoing message immediately to UI
    const outgoingMessage: WhatsAppMessage = {
      id: `out-${Date.now()}`,
      content,
      isUser: false,
      isHumanReply: isHumanControlled,
      timestamp: new Date(),
      attachment,
    };

    setMessages(prev => [...prev, outgoingMessage]);
    setIsLoading(true);

    try {
      if (isHumanControlled) {
        // Human mode: send directly to WhatsApp Cloud API
        const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
          body: {
            message: content,
            recipientNumber: senderNumber,
            attachment,
          },
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to send');

      } else {
        // AI mode: send to n8n webhook
        const { data, error } = await supabase.functions.invoke('whatsapp-web-chat', {
          body: {
            message: content,
            senderNumber,
            attachment,
          },
        });

        if (error) throw error;

        // Add AI response
        const aiMessage: WhatsAppMessage = {
          id: `ai-${Date.now()}`,
          content: data?.response || 'Sorry, I could not process your request.',
          isUser: false,
          isHumanReply: false,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);

      const errContent: string = isHumanControlled
        ? 'فشل إرسال الرسالة للعميل. تحقق من إعدادات WhatsApp API.'
        : 'Sorry, there was an error processing your message. Please try again.';

      const errorMessage: WhatsAppMessage = {
        id: `error-${Date.now()}`,
        content: errContent,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [senderNumber, isHumanControlled]);

  return {
    messages,
    isLoading,
    isLoadingHistory,
    sendMessage,
    senderNumber,
    availableNumbers,
    changeSenderNumber,
    isHumanControlled,
    isTogglingControl,
    toggleHumanControl,
  };
};
