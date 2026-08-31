import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { UploadedAttachment } from './useWhatsAppAttachment';
import { toast } from 'sonner';

export interface WhatsAppMessage {
  id: string;
  content: string;
  isUser: boolean;
  isHumanReply?: boolean;
  timestamp: Date;
  mediaUrl?: string;
  attachment?: UploadedAttachment;
  repliedByName?: string;
}

// Derive a display first name from the auth user
const deriveFirstName = (user: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined): string | undefined => {
  if (!user) return undefined;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fromMeta = typeof meta.first_name === 'string' ? meta.first_name.trim() : '';
  if (fromMeta) return fromMeta;
  const fullName = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
  if (fullName) return fullName.split(/\s+/)[0];
  const email = user.email ?? '';
  const local = email.split('@')[0] ?? '';
  const raw = local.split(/[._-]/)[0] ?? '';
  if (!raw) return undefined;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
};

// Get or create persistent sender number
const PHONE_NUMBER_REGEX = /^\+?\d{7,15}$/;
const DEFAULT_SENDER_NUMBER = import.meta.env.VITE_WA_DEFAULT_NUMBER?.trim() ?? '';

/**
 * Accepts only dialable E.164-style sender numbers so user-controlled values
 * cannot be reused as unsafe query input.
 */
const sanitizeSenderNumber = (num: string): string | null => {
  const normalized = num.trim();
  if (!PHONE_NUMBER_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
};

const getSenderNumber = () => {
  const stored = localStorage.getItem('whatsapp_sender_number');
  const sanitizedStored = stored ? sanitizeSenderNumber(stored) : null;
  if (sanitizedStored) return sanitizedStored;

  const sanitizedDefault = sanitizeSenderNumber(DEFAULT_SENDER_NUMBER);
  if (sanitizedDefault) return sanitizedDefault;

  return '';
};

const saveSenderNumber = (number: string) => {
  const sanitized = sanitizeSenderNumber(number);
  if (!sanitized) {
    localStorage.removeItem('whatsapp_sender_number');
    return null;
  }

  localStorage.setItem('whatsapp_sender_number', sanitized);
  return sanitized;
};

export const useWhatsAppChat = () => {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [senderNumber, setSenderNumber] = useState(getSenderNumber);
  const [isHumanControlled, setIsHumanControlled] = useState(false);
  const [isTogglingControl, setIsTogglingControl] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastMessageTsRef = useRef<string>(new Date(0).toISOString());

  useEffect(() => {
    if (messages.length > 0) {
      lastMessageTsRef.current = messages[messages.length - 1].timestamp.toISOString();
    }
  }, [messages]);

  // Load conversation history on mount or when sender changes
  useEffect(() => {
    const loadHistory = async () => {
      const sanitizedSenderNumber = sanitizeSenderNumber(senderNumber);
      if (!sanitizedSenderNumber) {
        setMessages([]);
        setIsHumanControlled(false);
        setIsLoadingHistory(false);
        toast.error('Invalid WhatsApp sender number. Please choose a valid number.');
        return;
      }

      setIsLoadingHistory(true);
      try {
        // Newest-first + limit: PostgREST clamps un-limited responses at 1000 rows,
        // and the old ascending query therefore showed the OLDEST 1000 of a long
        // thread (hiding current messages). Fetch the newest 1000 and reverse into
        // chronological order. Threads longer than 1000 rows lose their pre-limit
        // history until Phase-2 pagination.
        const { data: newestFirst, error } = await supabase
          .from('Chat History')
          .select('*')
          .eq('Sender Number', sanitizedSenderNumber)
          .eq('is_archived', false)
          .order('created_at', { ascending: false })
          .limit(1000);

        if (error) {
          if (import.meta.env.DEV) console.error('Error loading chat history:', error);
          return;
        }

        const data = newestFirst ? [...newestFirst].reverse() : newestFirst;

        if (data && data.length > 0) {
          const historyMessages: WhatsAppMessage[] = [];
          
          // Read authoritative control state regardless of n8n row inserts.
          const { data: controlData } = await supabase.rpc(
            'is_conversation_human_controlled',
            { p_sender_number: sanitizedSenderNumber }
          );
          setIsHumanControlled(Boolean(controlData));

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
                repliedByName: (chat as Record<string, unknown>)['replied_by_name'] as string | undefined,
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
        if (import.meta.env.DEV) console.error('Failed to load history:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [senderNumber]);

  // Polling fallback for cases where Supabase Realtime does not deliver inserts.
  useEffect(() => {
    const sanitizedSenderNumber = sanitizeSenderNumber(senderNumber);
    if (!sanitizedSenderNumber) {
      return undefined;
    }

    const poll = async () => {
      const { data, error } = await supabase
        .from('Chat History')
        .select('*')
        .eq('Sender Number', sanitizedSenderNumber)
        .eq('is_archived', false)
        .gt('created_at', lastMessageTsRef.current)
        .order('created_at', { ascending: true });

      if (error || !data || data.length === 0) {
        return;
      }

      const newMessages: WhatsAppMessage[] = [];
      for (const row of data) {
        let mediaUrl: string | undefined;
        let attachment: UploadedAttachment | undefined;

        if (row['Media']) {
          if (typeof row['Media'] === 'string') {
            try {
              const parsed = JSON.parse(row['Media']) as Record<string, unknown>;
              const url = (parsed.url || parsed.link || parsed.src) as string | undefined;
              if (url && typeof parsed.kind === 'string') {
                attachment = {
                  url,
                  filename: (parsed.filename as string) || 'file',
                  mimeType: (parsed.mimeType as string) || '',
                  size: (parsed.size as number) || 0,
                  kind: parsed.kind as UploadedAttachment['kind'],
                };
              } else {
                mediaUrl = url;
              }
            } catch {
              mediaUrl = row['Media'];
            }
          } else if (typeof row['Media'] === 'object' && row['Media'] !== null) {
            const m = row['Media'] as Record<string, unknown>;
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

        if (row['Sender Message']) {
          newMessages.push({
            id: `user-${row.id}`,
            content: row['Sender Message'],
            isUser: true,
            timestamp: new Date(row.created_at),
            mediaUrl,
            attachment,
          });
        }

        if (row['human_reply']) {
          newMessages.push({
            id: `human-${row.id}`,
            content: row['human_reply'],
            isUser: false,
            isHumanReply: true,
            timestamp: new Date(row.created_at),
            repliedByName: row['replied_by_name'] ?? undefined,
          });
        } else if (row['Ai Reply']) {
          newMessages.push({
            id: `ai-${row.id}`,
            content: row['Ai Reply'],
            isUser: false,
            isHumanReply: false,
            timestamp: new Date(row.created_at),
          });
        }
      }

      if (newMessages.length === 0) {
        return;
      }

      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const fresh = newMessages.filter((m) => !existingIds.has(m.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    };

    const interval = setInterval(poll, 8000);
    return () => clearInterval(interval);
  }, [senderNumber]);

  // Realtime subscription for the active conversation
  useEffect(() => {
    const sanitizedSenderNumber = sanitizeSenderNumber(senderNumber);
    if (!sanitizedSenderNumber) {
      return undefined;
    }

    // Unsubscribe previous channel if it exists
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`whatsapp-chat-${sanitizedSenderNumber}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'Chat History',
          filter: `Sender Number=eq.${sanitizedSenderNumber}`,
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
              repliedByName: (chat['replied_by_name'] as string | undefined) ?? undefined,
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

          // Re-query authoritative state on every DB insert.
          supabase
            .rpc('is_conversation_human_controlled', { p_sender_number: sanitizedSenderNumber })
            .then(({ data: controlData }) => {
              setIsHumanControlled(Boolean(controlData));
            });
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
    const sanitized = saveSenderNumber(number);
    if (!sanitized) {
      toast.error('Invalid WhatsApp sender number. Use 7 to 15 digits, optionally starting with +.');
      return;
    }

    setSenderNumber(sanitized);
  }, []);

  // Toggle human takeover mode
  const toggleHumanControl = useCallback(async () => {
    const sanitizedSenderNumber = sanitizeSenderNumber(senderNumber);
    if (!sanitizedSenderNumber) {
      toast.error('Invalid WhatsApp sender number. Please choose a valid number.');
      return;
    }

    setIsTogglingControl(true);
    const newState = !isHumanControlled;
    
    try {
      const { error } = await supabase.functions.invoke('whatsapp-send-message', {
        body: {
          action: newState ? 'takeover' : 'release',
          recipientNumber: sanitizedSenderNumber,
        },
      });

      if (error) throw error;
      setIsHumanControlled(newState);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error toggling human control:', err);
    } finally {
      setIsTogglingControl(false);
    }
  }, [isHumanControlled, senderNumber]);

  const sendMessage = useCallback(async (content: string, attachment?: UploadedAttachment) => {
    const sanitizedSenderNumber = sanitizeSenderNumber(senderNumber);
    if (!sanitizedSenderNumber) {
      toast.error('Invalid WhatsApp sender number. Please choose a valid number.');
      return;
    }

    // Pre-flight: if AI mode in UI, verify live human-control status BEFORE adding the outgoing bubble.
    // If human control is active server-side, show guidance instead of attempting to send.
    if (!isHumanControlled) {
      try {
        const { data: statusData } = await supabase.functions.invoke('whatsapp-control-status', {
          body: { senderNumber: sanitizedSenderNumber },
        });
        if (statusData?.isHumanControlled) {
          const guidance: WhatsAppMessage = {
            id: crypto.randomUUID(),
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
        if (import.meta.env.DEV) console.warn('Pre-flight control-status check failed, proceeding:', preflightErr);
      }
    }

    // Resolve current user's first name for optimistic bubble
    const { data: userData } = await supabase.auth.getUser();
    const myFirstName = deriveFirstName(userData?.user ?? null);

    // Add outgoing message immediately to UI
    const outgoingMessage: WhatsAppMessage = {
      id: crypto.randomUUID(),
      content,
      isUser: false,
      isHumanReply: isHumanControlled,
      timestamp: new Date(),
      attachment,
      repliedByName: isHumanControlled ? myFirstName : undefined,
    };

    setMessages(prev => [...prev, outgoingMessage]);
    setIsLoading(true);

    try {
      if (isHumanControlled) {
        // Human mode: send directly to WhatsApp Cloud API
        const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
          body: {
            message: content,
            recipientNumber: sanitizedSenderNumber,
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
            senderNumber: sanitizedSenderNumber,
            attachment,
          },
        });

        if (error) throw error;

        // Add AI response
        const aiMessage: WhatsAppMessage = {
          id: crypto.randomUUID(),
          content: data?.response || 'Sorry, I could not process your request.',
          isUser: false,
          isHumanReply: false,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMessage]);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error sending message:', error);

      const errContent: string = isHumanControlled
        ? 'فشل إرسال الرسالة للعميل. تحقق من إعدادات WhatsApp API.'
        : 'Please press the Take Over button above to send messages to the user';

      const errorMessage: WhatsAppMessage = {
        id: crypto.randomUUID(),
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
    changeSenderNumber,
    isHumanControlled,
    isTogglingControl,
    toggleHumanControl,
  };
};
