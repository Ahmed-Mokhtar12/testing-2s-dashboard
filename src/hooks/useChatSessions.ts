
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messages: any[];
}

export const useChatSessions = () => {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Load chat sessions from Supabase
  const loadChatSessions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('Chat History')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group messages by session and create session objects
      const sessionMap = new Map<string, ChatSession>();
      
      data?.forEach((chat) => {
        const sessionId = chat["Sender Number"] || 'guest';
        const timestamp = new Date(chat.created_at);
        
        if (!sessionMap.has(sessionId)) {
          sessionMap.set(sessionId, {
            id: sessionId,
            title: chat["Sender Message"]?.substring(0, 50) + '...' || 'New Chat',
            lastMessage: chat["Ai Reply"]?.substring(0, 100) + '...' || '',
            timestamp,
            messages: []
          });
        }
        
        const session = sessionMap.get(sessionId)!;
        if (timestamp > session.timestamp) {
          session.timestamp = timestamp;
          session.lastMessage = chat["Ai Reply"]?.substring(0, 100) + '...' || '';
        }
        
        session.messages.push({
          id: chat.id,
          userMessage: chat["Sender Message"],
          aiReply: chat["Ai Reply"],
          timestamp
        });
      });

      setChatSessions(Array.from(sessionMap.values()));
    } catch (error) {
      console.error('Error loading chat sessions:', error);
      toast({
        title: "Error",
        description: "Failed to load chat history",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Save a chat message to Supabase with proper session ID
  const saveChatMessage = async (userMessage: string, aiReply: string, sessionId?: string) => {
    try {
      // Use the active session ID or create a new one
      const finalSessionId = sessionId || activeSessionId || createNewSessionId();
      
      const { error } = await supabase
        .from('Chat History')
        .insert({
          "Sender Message": userMessage,
          "Ai Reply": aiReply,
          "Sender Number": finalSessionId,
          created_at: new Date().toISOString()
        });

      if (error) throw error;
      
      // If this is a new session, set it as active
      if (!activeSessionId) {
        setActiveSessionId(finalSessionId);
      }
      
      // Reload sessions to reflect the new message
      await loadChatSessions();
    } catch (error) {
      console.error('Error saving chat message:', error);
      toast({
        title: "Error",
        description: "Failed to save chat message",
        variant: "destructive"
      });
    }
  };

  // Create a new session ID
  const createNewSessionId = () => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Create a new chat session
  const createNewSession = () => {
    const newSessionId = createNewSessionId();
    setActiveSessionId(newSessionId);
    return newSessionId;
  };

  // Select a chat session
  const selectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    const session = chatSessions.find(s => s.id === sessionId);
    return session?.messages || [];
  };

  // Load chat sessions on mount
  useEffect(() => {
    loadChatSessions();
  }, []);

  return {
    chatSessions,
    activeSessionId,
    loading,
    loadChatSessions,
    saveChatMessage,
    createNewSession,
    selectSession,
    createNewSessionId
  };
};
