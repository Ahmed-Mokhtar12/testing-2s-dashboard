import React, { createContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Helper: ensure user_metadata.first_name exists (derived from email)
    const ensureFirstName = (u: User | null) => {
      if (!u) return;
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      if (typeof meta.first_name === 'string' && meta.first_name.trim().length > 0) return;
      const email = u.email ?? '';
      const local = email.split('@')[0] ?? '';
      const rawFirst = local.split(/[._-]/)[0] ?? '';
      if (!rawFirst) return;
      const firstName = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase();
      // Fire and forget — don't block auth flow
      supabase.auth.updateUser({ data: { first_name: firstName } }).catch((err) => {
        console.warn('Failed to set first_name on user_metadata:', err);
      });
    };

    // 1) Subscribe FIRST to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
      // Defer to avoid running inside the callback synchronously
      setTimeout(() => ensureFirstName(newSession?.user ?? null), 0);
    });

    // 2) THEN fetch the existing session
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
