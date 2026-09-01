import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { encryptData, decryptData } from '@/utils/secureStorage';

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messages: Array<{
    id: string | number;
    userMessage: string;
    aiReply: string;
    timestamp: Date;
  }>;
}

const STORAGE_PREFIX = 'sera_chat_sessions_v1';
const ACTIVE_PREFIX = 'sera_active_session_v1';
const MAX_SESSIONS = 50;
const keyFor = (prefix: string, userId?: string | null) =>
  userId ? `${prefix}__${userId}` : prefix;

type StoredSession = Omit<ChatSession, 'timestamp' | 'messages'> & {
  timestamp: string;
  messages: Array<{
    id: string | number;
    userMessage: string;
    aiReply: string;
    timestamp: string;
  }>;
};

const truncate = (text: string, len: number) =>
  !text ? '' : text.length > len ? `${text.slice(0, len)}…` : text;

const serializeSessions = (sessions: ChatSession[]): StoredSession[] =>
  sessions.slice(0, MAX_SESSIONS).map((session) => ({
    ...session,
    timestamp: session.timestamp.toISOString(),
    messages: session.messages.map((message) => ({
      ...message,
      timestamp: message.timestamp.toISOString(),
    })),
  }));

const deserializeSessions = (raw: string): ChatSession[] => {
  const parsed: StoredSession[] = JSON.parse(raw);
  return parsed.map((session) => ({
    ...session,
    timestamp: new Date(session.timestamp),
    messages: session.messages.map((message) => ({
      ...message,
      timestamp: new Date(message.timestamp),
    })),
  }));
};

export const useSeraLocalSessions = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const storageKey = useMemo(() => keyFor(STORAGE_PREFIX, userId), [userId]);
  const activeKey = useMemo(() => keyFor(ACTIVE_PREFIX, userId), [userId]);

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const { toast } = useToast();
  const persistFailureShownRef = useRef(false);

  const persistSessions = useCallback(
    async (sessions: ChatSession[]) => {
      if (!userId) return;

      try {
        const encrypted = await encryptData(
          JSON.stringify(serializeSessions(sessions)),
          userId
        );
        localStorage.setItem(storageKey, encrypted);
      } catch (error) {
        if (import.meta.env.DEV) console.warn('Failed to persist Sera sessions', error);
        // Surface it once: a save that fails silently loses every later conversation on
        // reload (audit A2).
        if (!persistFailureShownRef.current) {
          persistFailureShownRef.current = true;
          toast({
            title: 'Chat history could not be saved',
            description: 'Your Sera conversations will not survive a reload.',
            variant: 'destructive',
          });
        }
      }
    },
    [storageKey, userId, toast]
  );

  const persistActiveSessionId = useCallback(
    async (sessionId: string | null) => {
      if (!userId) return;

      try {
        if (!sessionId) {
          localStorage.removeItem(activeKey);
          return;
        }

        const encrypted = await encryptData(sessionId, userId);
        localStorage.setItem(activeKey, encrypted);
      } catch (error) {
        if (import.meta.env.DEV) console.warn('Failed to persist active session id', error);
      }
    },
    [activeKey, userId]
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!userId) {
        setChatSessions([]);
        setActiveSessionIdState(null);
        return;
      }

      try {
        const encryptedSessions = localStorage.getItem(storageKey);
        const encryptedActiveId = localStorage.getItem(activeKey);

        let sessions: ChatSession[] = [];
        let nextActiveSessionId: string | null = null;

        if (encryptedSessions) {
          try {
            const decryptedSessions = await decryptData(encryptedSessions, userId);
            sessions = deserializeSessions(decryptedSessions).sort(
              (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
            );
          } catch (error) {
            if (import.meta.env.DEV) console.warn('Failed to read Sera sessions from storage', error);
            localStorage.removeItem(storageKey);
          }
        }

        if (encryptedActiveId) {
          try {
            nextActiveSessionId = await decryptData(encryptedActiveId, userId);
          } catch (error) {
            if (import.meta.env.DEV) console.warn('Failed to read active session id from storage', error);
            localStorage.removeItem(activeKey);
          }
        }

        if (!cancelled) {
          setChatSessions(sessions);
          setActiveSessionIdState(nextActiveSessionId);
        }
      } catch (error) {
        if (import.meta.env.DEV) console.warn('Failed to initialize encrypted session storage', error);
        if (!cancelled) {
          setChatSessions([]);
          setActiveSessionIdState(null);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeKey, storageKey, userId]);

  useEffect(() => {
    void persistSessions(chatSessions);
  }, [chatSessions, persistSessions]);

  useEffect(() => {
    void persistActiveSessionId(activeSessionId);
  }, [activeSessionId, persistActiveSessionId]);

  const setActiveSessionId = useCallback((id: string | null) => {
    setActiveSessionIdState((prev) => (prev === id ? prev : id));
  }, []);

  const createNewSessionId = useCallback(() => `session_${crypto.randomUUID()}`, []);

  const createNewSession = useCallback(() => {
    const id = createNewSessionId();
    setActiveSessionIdState(id);
    return id;
  }, [createNewSessionId]);

  const saveChatMessage = useCallback(
    async (userMessage: string, aiReply: string, sessionId?: string) => {
      const finalId = sessionId || activeSessionId || createNewSessionId();
      const now = new Date();

      setChatSessions((prev) => {
        const existing = prev.find((session) => session.id === finalId);
        const newMessage = {
          id: crypto.randomUUID(),
          userMessage,
          aiReply,
          timestamp: now,
        };

        let next: ChatSession[];
        if (existing) {
          next = prev.map((session) =>
            session.id === finalId
              ? {
                  ...session,
                  lastMessage: truncate(aiReply, 100),
                  timestamp: now,
                  messages: [...session.messages, newMessage],
                }
              : session
          );
        } else {
          next = [
            {
              id: finalId,
              title: truncate(userMessage || 'New Chat', 50),
              lastMessage: truncate(aiReply, 100),
              timestamp: now,
              messages: [newMessage],
            },
            ...prev,
          ];
        }

        return [...next].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      });

      if (activeSessionId !== finalId) {
        setActiveSessionIdState(finalId);
      }
    },
    [activeSessionId, createNewSessionId]
  );

  const selectSession = useCallback(
    (sessionId: string) => {
      setActiveSessionIdState(sessionId);
      const session = chatSessions.find((item) => item.id === sessionId);
      return session?.messages || [];
    },
    [chatSessions]
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      setChatSessions((prev) => prev.filter((session) => session.id !== sessionId));
      if (activeSessionId === sessionId) setActiveSessionIdState(null);
      toast({ title: 'Conversation removed' });
    },
    [activeSessionId, toast]
  );

  return {
    chatSessions,
    activeSessionId,
    setActiveSessionId,
    saveChatMessage,
    createNewSession,
    selectSession,
    deleteSession,
    createNewSessionId,
  };
};
