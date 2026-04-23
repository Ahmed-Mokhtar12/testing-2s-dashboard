
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messages: import('./useSessionManagement').StoredSessionMessage[];
}

export const useChatSessions = () => {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Load chat sessions from Supabase (only non-archived)
  const loadChatSessions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('website_chats')
        .select('*')
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group messages by session and create session objects
      const sessionMap = new Map<string, ChatSession>();
      
      data?.forEach((chat) => {
        const sessionId = chat.session_id || 'guest';
        const timestamp = new Date(chat.created_at);
        
        if (!sessionMap.has(sessionId)) {
          sessionMap.set(sessionId, {
            id: sessionId,
            title: chat.user_message?.substring(0, 50) + '...' || 'New Chat',
            lastMessage: chat.ai_response?.substring(0, 100) + '...' || '',
            timestamp,
            messages: []
          });
        }
        
        const session = sessionMap.get(sessionId)!;
        if (timestamp > session.timestamp) {
          session.timestamp = timestamp;
          session.lastMessage = chat.ai_response?.substring(0, 100) + '...' || '';
        }
        
        session.messages.push({
          id: chat.id,
          userMessage: chat.user_message,
          aiReply: chat.ai_response,
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
        .from('website_chats')
        .insert({
          user_message: userMessage,
          ai_response: aiReply,
          session_id: finalSessionId,
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

  // Create a cryptographically secure session ID using UUID v4
  const createNewSessionId = () => {
    return `session_${crypto.randomUUID()}`;
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

  // Archive a chat session (soft delete)
  const deleteSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('website_chats')
        .update({ is_archived: true })
        .eq('session_id', sessionId);

      if (error) throw error;

      // If archiving the active session, clear it
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
      }

      // Reload sessions to reflect the archiving
      await loadChatSessions();
      
      toast({
        title: "Success",
        description: "Conversation archived successfully"
      });
    } catch (error) {
      console.error('Error archiving chat session:', error);
      toast({
        title: "Error",
        description: "Failed to archive conversation",
        variant: "destructive"
      });
    }
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
    deleteSession,
    createNewSessionId
  };
};
