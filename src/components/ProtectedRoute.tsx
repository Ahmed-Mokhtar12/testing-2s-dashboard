import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

function urlHasRecoveryToken(): boolean {
  try {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    const type = url.searchParams.get('type') || hashParams.get('type');
    if (type === 'recovery') return true;
    // PKCE recovery codes can also arrive on root
    if (url.searchParams.has('code') && type === 'recovery') return true;
    return false;
  } catch {
    return false;
  }
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isRecovering } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If a password recovery is in progress, force the user to /reset-password
  // even if Supabase already created a session for them.
  if ((isRecovering || urlHasRecoveryToken()) && location.pathname !== '/reset-password') {
    return <Navigate to="/reset-password" replace />;
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
