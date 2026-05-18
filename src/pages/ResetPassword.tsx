import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { validatePasswordStrength } from '@/utils/passwordStrength';
import { getErrorMessage } from '@/utils/errorUtils';

const strengthToProgress = {
  weak: 30,
  medium: 65,
  strong: 100,
} as const;

const strengthToTone = {
  weak: 'text-destructive',
  medium: 'text-amber-600',
  strong: 'text-emerald-600',
} as const;

const ResetPasswordPage: React.FC = () => {
  const { user, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const strength = useMemo(() => validatePasswordStrength(password), [password]);

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

        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            type: type as 'recovery',
            token_hash: tokenHash,
          });
          if (error) {
            if (import.meta.env.DEV) console.error('verifyOtp failed:', error);
            const {
              data: { session: existing },
            } = await supabase.auth.getSession();
            if (!cancelled) {
              if (existing) {
                setSessionReady(true);
              } else {
                setExchangeError(error.message);
              }
              setReady(true);
            }
            return;
          }
          window.history.replaceState({}, '', url.pathname);
          if (!cancelled) setSessionReady(true);
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            if (import.meta.env.DEV) console.error('exchangeCodeForSession failed:', error);
            if (!cancelled) {
              setExchangeError(error.message);
              setReady(true);
            }
            return;
          }
          window.history.replaceState({}, '', url.pathname);
          if (!cancelled) setSessionReady(true);
        }

        await new Promise((r) => setTimeout(r, 250));

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled) {
          if (!session && !code && !tokenHash && !hashParams.get('access_token')) {
            setExchangeError(
              'This reset link is missing the recovery token. It may have been opened in a different browser, or the link is malformed. Please request a new password reset link.'
            );
          }
          setReady(true);
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('Reset password init error:', err);
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

    if (!strength.isValid) {
      toast.error('Password must include uppercase, lowercase, number, special character, and at least 8 characters.');
      return;
    }

    if (strength.label === 'weak') {
      toast.error('Choose a stronger password before continuing.');
      return;
    }

    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }

    setSubmitting(true);
    const { error } = await updatePassword(password);

    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
    setSubmitting(false);

    if (signOutError) {
      toast.error(getErrorMessage(signOutError));
      return;
    }

    toast.success('Password updated. Please log in again.');
    navigate('/auth', { replace: true });
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sessionReady && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="font-display font-semibold mb-2">Reset link expired</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {exchangeError ? exchangeError : 'Please request a new password reset link.'}
          </p>
          <Button
            className="w-full mb-3"
            onClick={() =>
              navigate('/auth', {
                state: {
                  openReset: true,
                  resetError: 'Your previous reset link has expired. Enter your email below to request a new one.',
                },
              })
            }
          >
            Request a new reset link
          </Button>
          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Back to sign in
          </button>
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
            <PasswordInput
              id="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Password strength</span>
              <span className={strengthToTone[strength.label]}>
                {strength.label.charAt(0).toUpperCase() + strength.label.slice(1)}
              </span>
            </div>
            <Progress value={strengthToProgress[strength.label]} className="h-2" />
            <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground">
              <span>{strength.checks.minLength ? '✓' : '•'} At least 8 characters</span>
              <span>{strength.checks.uppercase ? '✓' : '•'} One uppercase letter</span>
              <span>{strength.checks.lowercase ? '✓' : '•'} One lowercase letter</span>
              <span>{strength.checks.number ? '✓' : '•'} One number</span>
              <span>{strength.checks.special ? '✓' : '•'} One special character: `! @ # $ % ^ & *`</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <PasswordInput
              id="confirm-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting || !strength.isValid}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Update password
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default ResetPasswordPage;
