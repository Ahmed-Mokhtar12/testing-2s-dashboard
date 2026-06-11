import React, { useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    // Detect recovery flow from URL on initial load — covers cases where Supabase
    // redirects to "/" with recovery tokens in the hash/query before the
    // PASSWORD_RECOVERY event fires.
    try {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      const type = url.searchParams.get('type') || hashParams.get('type');
      if (type === 'recovery') {
        setIsRecovering(true);
      }
    } catch { /* ignore */ }

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
      supabase.auth.updateUser({ data: { first_name: firstName } }).catch((err) => {
        if (import.meta.env.DEV) console.warn('Failed to set first_name on user_metadata:', err);
      });
    };

    // 1) Subscribe FIRST to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovering(true);
      }
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

  const signOut = async (): Promise<{ error: Error | null }> => {
    let outError: Error | null = null;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        // Server rejected (e.g. session not found / 403). Fall back to local cleanup
        // so the UI doesn't get stuck logged-in.
        if (import.meta.env.DEV) console.warn('Global signOut failed, falling back to local:', error.message);
        const { error: localError } = await supabase.auth.signOut({ scope: 'local' });
        if (localError) {
          outError = localError;
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('signOut threw, attempting local cleanup:', err);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (e) {
        outError = e instanceof Error ? e : new Error('Sign out failed');
      }
    }

    // Force-clear local state regardless — UI must reflect signed-out state.
    setUser(null);
    setSession(null);
    setIsRecovering(false);

    // As a last-resort cleanup, clear any lingering Supabase auth keys in storage.
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sb-') || k.includes('supabase.auth'))) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }

    return { error: outError };
  };

  const resetPassword = async (email: string) => {
    const envResetUrl = (import.meta.env.VITE_PASSWORD_RESET_URL as string | undefined)?.trim();
    const redirectTo = envResetUrl && envResetUrl.length > 0
      ? envResetUrl
      : `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  };

  const signInWithAzure = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'email profile openid offline_access',
        queryParams: { prompt: 'select_account' },
      },
    });
    return { error };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isRecovering, signIn, signOut, resetPassword, updatePassword, signInWithAzure }}>
      {children}
    </AuthContext.Provider>
  );
}
