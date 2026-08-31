import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { UploadedAttachment } from './useWhatsAppAttachment';
import { parseMediaColumn } from '@/lib/whatsappMedia';
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
  /** Local send lifecycle: 'pending' until the edge call resolves success,
      'sent' after. Only 'sent' bubbles may be reconciled away by their DB
      echo — a failed send keeps its bubble and can never be masked by
      another operator's identical message. */
  status?: 'pending' | 'sent';
  /** The "Chat History" row-id prefix this local bubble's echo will carry. */
  expectedEcho?: 'user' | 'ai' | 'human';
}

// One row -> bubbles mapping for ALL arrival paths (history, older pages,
// polling, realtime). A row's media belongs to the guest bubble when the row
// is a guest message, and to the human bubble when it is an operator send
// (human_reply + Media with no Sender Message) — operator attachments used to
// vanish on reload because only the guest bubble ever received media.
const rowToMessages = (chat: Record<string, unknown>): WhatsAppMessage[] => {
  const { mediaUrl, attachment } = parseMediaColumn(chat['Media']);
  const guestMediaOnly =
    Boolean(mediaUrl || attachment) && !chat['human_reply'] && !chat['Ai Reply'];
  const guestHasBubble = Boolean(chat['Sender Message']) || guestMediaOnly;
  const out: WhatsAppMessage[] = [];
  const id = chat['id'] as number;
  const timestamp = new Date(chat['created_at'] as string);

  if (guestHasBubble) {
    out.push({
      id: `user-${id}`,
      content: (chat['Sender Message'] as string | null) ?? '',
      isUser: true,
      timestamp,
      mediaUrl,
      attachment,
    });
  }

  if (chat['human_reply']) {
    out.push({
      id: `human-${id}`,
      content: chat['human_reply'] as string,
      isUser: false,
      isHumanReply: true,
      timestamp,
      repliedByName: (chat['replied_by_name'] as string | null) ?? undefined,
      mediaUrl: guestHasBubble ? undefined : mediaUrl,
      attachment: guestHasBubble ? undefined : attachment,
    });
  } else if (chat['Ai Reply']) {
    out.push({
      id: `ai-${id}`,
      content: chat['Ai Reply'] as string,
      isUser: false,
      isHumanReply: false,
      timestamp,
    });
  }
  return out;
};

// Adopt the DB row id for a locally-created bubble once the edge function
// reports it. If the realtime echo already arrived (it can beat the HTTP
// response), drop the local twin instead of creating a duplicate id.
const adoptId = (
  prev: WhatsAppMessage[],
  localId: string,
  dbId: string
): WhatsAppMessage[] =>
  prev.some((m) => m.id === dbId)
    ? prev.filter((m) => m.id !== localId)
    : prev.map((m) =>
        m.id === localId
          ? { ...m, id: dbId, status: undefined, expectedEcho: undefined }
          : m
      );

// Drop the local twin of each incoming DB-derived message: same echo prefix,
// same trimmed content, created within the last 30s, and already confirmed
// 'sent'. Residual (accepted for Phase 1): two operators sending identical
// text within 30s can swap attribution; clean row-id reconciliation is
// Phase 2 (edge functions returning the inserted row id).
const reconcileEcho = (
  prev: WhatsAppMessage[],
  incoming: WhatsAppMessage[]
): WhatsAppMessage[] => {
  let next = prev;
  for (const msg of incoming) {
    const prefix = msg.id.startsWith('user-')
      ? 'user'
      : msg.id.startsWith('ai-')
        ? 'ai'
        : msg.id.startsWith('human-')
          ? 'human'
          : null;
    if (!prefix) continue;
    const content = msg.content.trim();
    const idx = next.findIndex(
      (m) =>
        m.status === 'sent' &&
        m.expectedEcho === prefix &&
        m.content.trim() === content &&
        Date.now() - m.timestamp.getTime() <= 30_000
    );
    if (idx !== -1) next = [...next.slice(0, idx), ...next.slice(idx + 1)];
  }
  return next;
};

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

// One PostgREST page (server clamps at 1000 anyway); older pages load on demand.
const PAGE_SIZE = 1000;
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
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const oldestLoadedAtRef = useRef<string | null>(null);
  const controlRecheckTimerRef = useRef<number | null>(null);

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
        // An empty selection means "no chat open" (hero panel) — only a
        // non-empty malformed number deserves a toast.
        if (senderNumber) {
          toast.error('Invalid WhatsApp sender number. Please choose a valid number.');
        }
        return;
      }

      // Never show the previous guest's thread under the new header while
      // (or after a failed) fetch — clear first, then load.
      setMessages([]);
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
          .limit(PAGE_SIZE);

        if (error) {
          if (import.meta.env.DEV) console.error('Error loading chat history:', error);
          return;
        }

        // newestFirst is descending: last element is the oldest loaded row.
        setHasMoreHistory((newestFirst?.length ?? 0) === PAGE_SIZE);
        oldestLoadedAtRef.current = newestFirst?.length
          ? (newestFirst[newestFirst.length - 1].created_at as string)
          : null;

        const data = newestFirst ? [...newestFirst].reverse() : newestFirst;

        if (data && data.length > 0) {
          // Read authoritative control state regardless of n8n row inserts.
          const { data: controlData } = await supabase.rpc(
            'is_conversation_human_controlled',
            { p_sender_number: sanitizedSenderNumber }
          );
          setIsHumanControlled(Boolean(controlData));

          setMessages(data.flatMap((chat) => rowToMessages(chat)));
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

      const newMessages: WhatsAppMessage[] = data.flatMap((row) => rowToMessages(row));

      if (newMessages.length === 0) {
        return;
      }

      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const fresh = newMessages.filter((m) => !existingIds.has(m.id));
        return fresh.length > 0 ? [...reconcileEcho(prev, fresh), ...fresh] : prev;
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
          const newMessages = rowToMessages(chat);

          if (newMessages.length > 0) {
            setMessages((prev) => {
              // Deduplicate by id, then drop reconciled optimistic twins
              const existingIds = new Set(prev.map((m) => m.id));
              const fresh = newMessages.filter((m) => !existingIds.has(m.id));
              return fresh.length > 0 ? [...reconcileEcho(prev, fresh), ...fresh] : prev;
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'Chat History',
          filter: `Sender Number=eq.${sanitizedSenderNumber}`,
        },
        (payload) => {
          // Takeover/auto-release flips arrive as bulk UPDATEs (one event per
          // row, full old row via REPLICA IDENTITY FULL). React only to the
          // control-flag transition, coalesced — never re-render per event.
          const oldRow = payload.old as Record<string, unknown>;
          const newRow = payload.new as Record<string, unknown>;
          if (oldRow['is_human_controlled'] === newRow['is_human_controlled']) return;
          if (controlRecheckTimerRef.current !== null) return;
          controlRecheckTimerRef.current = window.setTimeout(() => {
            controlRecheckTimerRef.current = null;
            supabase
              .rpc('is_conversation_human_controlled', { p_sender_number: sanitizedSenderNumber })
              .then(({ data: controlData }) => {
                setIsHumanControlled(Boolean(controlData));
              });
          }, 500);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (controlRecheckTimerRef.current !== null) {
        window.clearTimeout(controlRecheckTimerRef.current);
        controlRecheckTimerRef.current = null;
      }
    };
  }, [senderNumber]);

  // Prepend the previous page of history. The boundary is created_at-exclusive;
  // rows sharing the exact boundary millisecond would be skipped — accepted
  // (timestamps are effectively unique in this data; noted for Phase 3).
  const loadOlderMessages = useCallback(async () => {
    const sanitized = sanitizeSenderNumber(senderNumber);
    const before = oldestLoadedAtRef.current;
    if (!sanitized || !before || isLoadingOlder || isLoadingHistory) return;
    setIsLoadingOlder(true);
    try {
      const { data, error } = await supabase
        .from('Chat History')
        .select('*')
        .eq('Sender Number', sanitized)
        .eq('is_archived', false)
        .lt('created_at', before)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (error || !data) return;
      setHasMoreHistory(data.length === PAGE_SIZE);
      if (data.length > 0) {
        oldestLoadedAtRef.current = data[data.length - 1].created_at as string;
        const older = [...data].reverse().flatMap((row) => rowToMessages(row));
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          return [...older.filter((m) => !existing.has(m.id)), ...prev];
        });
      }
    } finally {
      setIsLoadingOlder(false);
    }
  }, [senderNumber, isLoadingOlder, isLoadingHistory]);

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
      status: 'pending',
      // Human-mode sends echo back as a human_reply row; AI-mode sends are
      // written by the n8n path as the guest's Sender Message row.
      expectedEcho: isHumanControlled ? 'human' : 'user',
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

        // Prefer exact row-id adoption (new edge versions return insertedId);
        // fall back to content-window reconciliation for older deployments.
        const insertedId = (data as { insertedId?: number | null })?.insertedId;
        setMessages(prev =>
          insertedId != null
            ? adoptId(prev, outgoingMessage.id, `human-${insertedId}`)
            : prev.map(m => (m.id === outgoingMessage.id ? { ...m, status: 'sent' as const } : m))
        );
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

        // The edge function writes the exchange row itself; adopt its row id
        // for both local bubbles when returned (user- and ai- echoes then
        // dedupe exactly), else fall back to content-window reconciliation.
        const insertedId = (data as { insertedId?: number | null })?.insertedId;
        const aiContent = data?.response || 'Sorry, I could not process your request.';
        setMessages(prev => {
          let next =
            insertedId != null
              ? adoptId(prev, outgoingMessage.id, `user-${insertedId}`)
              : prev.map(m =>
                  m.id === outgoingMessage.id ? { ...m, status: 'sent' as const } : m
                );
          const aiBase = {
            content: aiContent,
            isUser: false,
            isHumanReply: false,
            timestamp: new Date(),
          };
          if (insertedId != null) {
            if (!next.some(m => m.id === `ai-${insertedId}`)) {
              next = [...next, { ...aiBase, id: `ai-${insertedId}` }];
            }
          } else {
            next = [
              ...next,
              { ...aiBase, id: crypto.randomUUID(), status: 'sent' as const, expectedEcho: 'ai' as const },
            ];
          }
          return next;
        });
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
    hasMoreHistory,
    isLoadingOlder,
    loadOlderMessages,
    isHumanControlled,
    isTogglingControl,
    toggleHumanControl,
  };
};
