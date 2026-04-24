import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const ResetPasswordPage: React.FC = () => {
  const { user, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));

        const errorDescription =
          url.searchParams.get('error_description') ||
          hashParams.get('error_description');

        if (errorDescription) {
          if (!cancelled) {
            setExchangeError(errorDescription);
            setReady(true);
          }
          return;
        }

        const code = url.searchParams.get('code');
        const tokenHash = url.searchParams.get('token_hash') || hashParams.get('token_hash');
        const type = url.searchParams.get('type') || hashParams.get('type');

        // 1) New recovery flow: ?token_hash=...&type=recovery
        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            type: type as 'recovery',
            token_hash: tokenHash,
          });
          if (error) {
            console.error('verifyOtp failed:', error);
            if (!cancelled) {
              setExchangeError(error.message);
              setReady(true);
            }
            return;
          }
          window.history.replaceState({}, '', url.pathname);
        }
        // 2) PKCE flow: ?code=...
        else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('exchangeCodeForSession failed:', error);
            if (!cancelled) {
              setExchangeError(error.message);
              setReady(true);
            }
            return;
          }
          window.history.replaceState({}, '', url.pathname);
        }

        // 3) Implicit flow (#access_token=...) is auto-handled by supabase-js detectSessionInUrl.
        // Give it a tick to settle, then check the session.
        await new Promise((r) => setTimeout(r, 250));

        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled) {
          if (!session && !code && !tokenHash && !hashParams.get('access_token')) {
            setExchangeError(
              'This reset link is missing the recovery token. It may have been opened in a different browser, or the link is malformed. Please request a new password reset link.'
            );
          }
          setReady(true);
        }
      } catch (err) {
        console.error('Reset password init error:', err);
        if (!cancelled) {
          setExchangeError(err instanceof Error ? err.message : 'Failed to verify reset link');
          setReady(true);
        }
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password updated. Redirecting…');
      setTimeout(() => navigate('/', { replace: true }), 800);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="font-display font-semibold mb-2">Invalid or expired link</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {exchangeError
              ? exchangeError
              : 'Please request a new password reset link.'}
          </p>
          <Button onClick={() => navigate('/auth')}>Back to sign in</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8 bg-card-gradient border-border/60">
        <h1 className="font-display font-semibold text-xl mb-2">Set a new password</h1>
        <p className="text-sm text-muted-foreground mb-6">Choose a strong password to secure your account.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Update password
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default ResetPasswordPage;
