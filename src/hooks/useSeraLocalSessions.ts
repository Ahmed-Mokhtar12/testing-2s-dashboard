import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

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

const readStorage = (storageKey: string): ChatSession[] => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: StoredSession[] = JSON.parse(raw);
    return parsed.map((s) => ({
      ...s,
      timestamp: new Date(s.timestamp),
      messages: s.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch (e) {
    console.warn('Failed to read Sera sessions from storage', e);
    return [];
  }
};

const writeStorage = (storageKey: string, sessions: ChatSession[]) => {
  try {
    const serializable: StoredSession[] = sessions.slice(0, MAX_SESSIONS).map((s) => ({
      ...s,
      timestamp: s.timestamp.toISOString(),
      messages: s.messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() })),
    }));
    localStorage.setItem(storageKey, JSON.stringify(serializable));
  } catch (e) {
    console.warn('Failed to persist Sera sessions', e);
  }
};

const readActiveId = (activeKey: string): string | null => {
  try {
    return localStorage.getItem(activeKey);
  } catch {
    return null;
  }
};

const truncate = (text: string, len: number) =>
  !text ? '' : text.length > len ? `${text.slice(0, len)}…` : text;

export const useSeraLocalSessions = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const storageKey = useMemo(() => keyFor(STORAGE_PREFIX, userId), [userId]);
  const activeKey = useMemo(() => keyFor(ACTIVE_PREFIX, userId), [userId]);

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(() => readActiveId(activeKey));
  const { toast } = useToast();

  // Reload sessions whenever the active user changes
  useEffect(() => {
    setChatSessions(readStorage(storageKey).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
    setActiveSessionIdState(readActiveId(activeKey));
  }, [storageKey, activeKey]);

  // Persist activeSessionId whenever it changes
  useEffect(() => {
    try {
      if (activeSessionId) {
        localStorage.setItem(activeKey, activeSessionId);
      } else {
        localStorage.removeItem(activeKey);
      }
    } catch (e) {
      console.warn('Failed to persist active session id', e);
    }
  }, [activeSessionId, activeKey]);

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
        const existing = prev.find((s) => s.id === finalId);
        const newMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userMessage,
          aiReply,
          timestamp: now,
        };

        let next: ChatSession[];
        if (existing) {
          next = prev.map((s) =>
            s.id === finalId
              ? {
                  ...s,
                  lastMessage: truncate(aiReply, 100),
                  timestamp: now,
                  messages: [...s.messages, newMessage],
                }
              : s
          );
        } else {
          const newSession: ChatSession = {
            id: finalId,
            title: truncate(userMessage || 'New Chat', 50),
            lastMessage: truncate(aiReply, 100),
            timestamp: now,
            messages: [newMessage],
          };
          next = [newSession, ...prev];
        }

        next.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        writeStorage(storageKey, next);
        return next;
      });

      if (activeSessionId !== finalId) setActiveSessionIdState(finalId);
    },
    [activeSessionId, createNewSessionId, storageKey]
  );

  const selectSession = useCallback(
    (sessionId: string) => {
      setActiveSessionIdState(sessionId);
      const session = chatSessions.find((s) => s.id === sessionId);
      return session?.messages || [];
    },
    [chatSessions]
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      setChatSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        writeStorage(storageKey, next);
        return next;
      });
      if (activeSessionId === sessionId) setActiveSessionIdState(null);
      toast({ title: 'Conversation removed' });
    },
    [activeSessionId, toast, storageKey]
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
