import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Mail, Lock } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import twoSeasonsLogo from '@/assets/two-seasons-logo-full.png';

const SAFE_REDIRECT_ROUTES = new Set([
  '/',
  '/dashboard',
  '/dashboard/reviews',
  '/dashboard/whatsapp',
  '/dashboard/email',
  '/dashboard/competitors',
  '/dashboard/info-email',
  '/dashboard/social',
  '/dashboard/welcome',
  '/whatsapp',
  '/whatsapp-inbox',
]);

const SIGN_IN_ATTEMPT_LIMIT = 5;
const SIGN_IN_LOCKOUT_MS = 15 * 60 * 1000;
const RESET_ATTEMPT_LIMIT = 3;
const RESET_WINDOW_MS = 10 * 60 * 1000;

const isSafeRedirect = (path: string): boolean => {
  if (!path.startsWith('/')) {
    return false;
  }

  try {
    const url = new URL(path, window.location.origin);
    return SAFE_REDIRECT_ROUTES.has(url.pathname);
  } catch {
    return false;
  }
};

const formatRemaining = (remainingMs: number) => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const AuthPage: React.FC = () => {
  const { user, loading, isRecovering, signIn, signInWithAzure, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || '/';
  const safeRedirectTarget = isSafeRedirect(from) ? from : '/';
  const openReset = (location.state as { openReset?: boolean })?.openReset ?? false;
  const stateResetError = (location.state as { resetError?: string })?.resetError ?? null;

  const hasRecoveryInUrl = (() => {
    if (typeof window === 'undefined') return false;
    try {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      const type = url.searchParams.get('type') || hashParams.get('type');
      return type === 'recovery';
    } catch {
      return false;
    }
  })();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showReset, setShowReset] = useState(() => {
    if (openReset) return true;
    if (typeof window === 'undefined') return false;
    try {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      return !!(hashParams.get('error_code') || hashParams.get('error_description'));
    } catch {
      return false;
    }
  });
  const [resetEmail, setResetEmail] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('ts_remember_me') !== '0';
  });
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [resetAttemptTimestamps, setResetAttemptTimestamps] = useState<number[]>([]);
  const [urlAuthError] = useState<string | null>(() => {
    if (stateResetError) return stateResetError;
    if (typeof window === 'undefined') return null;
    try {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const errorCode = hashParams.get('error_code');
      const errorDescription = hashParams.get('error_description');
      if (errorCode || errorDescription) {
        return errorCode === 'otp_expired'
          ? 'Your password reset link has expired.'
          : (errorDescription ?? 'Your reset link is invalid or has expired.');
      }
      return null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!lockoutUntil && resetAttemptTimestamps.length === 0) return undefined;

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [lockoutUntil, resetAttemptTimestamps.length]);

  useEffect(() => {
    if (!urlAuthError) return;
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
  }, [urlAuthError]);

  useEffect(() => {
    if (loading) return;
    if (isRecovering || hasRecoveryInUrl) {
      navigate('/reset-password', { replace: true });
      return;
    }
    if (user) navigate(safeRedirectTarget, { replace: true });
  }, [loading, user, navigate, safeRedirectTarget, isRecovering, hasRecoveryInUrl]);

  const isLockedOut = Boolean(lockoutUntil && lockoutUntil > now);
  const lockoutMessage = lockoutUntil && lockoutUntil > now
    ? `Too many failed sign-in attempts. Try again in ${formatRemaining(lockoutUntil - now)}.`
    : null;

  const activeResetAttempts = useMemo(
    () => resetAttemptTimestamps.filter((timestamp) => now - timestamp < RESET_WINDOW_MS),
    [resetAttemptTimestamps, now]
  );
  const resetLockedUntil = activeResetAttempts.length >= RESET_ATTEMPT_LIMIT
    ? activeResetAttempts[0] + RESET_WINDOW_MS
    : null;
  const resetLockedOut = Boolean(resetLockedUntil && resetLockedUntil > now);
  const resetLockoutMessage = resetLockedUntil && resetLockedUntil > now
    ? `Too many reset requests. Try again in ${formatRemaining(resetLockedUntil - now)}.`
    : null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLockedOut) {
      toast.error(lockoutMessage || 'Too many failed sign-in attempts. Please try again later.');
      return;
    }

    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);

    if (error) {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);

      if (nextAttempts >= SIGN_IN_ATTEMPT_LIMIT) {
        const nextLockoutUntil = Date.now() + SIGN_IN_LOCKOUT_MS;
        setLockoutUntil(nextLockoutUntil);
        toast.error('Too many failed sign-in attempts. Please try again in 15 minutes.');
      } else {
        toast.error(error.message || 'Sign-in failed');
      }
      return;
    }

    setFailedAttempts(0);
    setLockoutUntil(null);

    try {
      localStorage.setItem('ts_remember_me', rememberMe ? '1' : '0');
    } catch {
      /* ignore */
    }

    toast.success('Welcome back');
    navigate(safeRedirectTarget, { replace: true });
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (resetLockedOut) {
      toast.error(resetLockoutMessage || 'Too many reset requests. Please try again later.');
      return;
    }

    setSubmitting(true);
    const { error } = await resetPassword(resetEmail);
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const requestTime = Date.now();
    setResetAttemptTimestamps((prev) =>
      [...prev, requestTime].filter((timestamp) => requestTime - timestamp < RESET_WINDOW_MS)
    );
    toast.success('Check your inbox for the reset link');
    setShowReset(false);
  };

  const handleAzureSignIn = async () => {
    setSubmitting(true);
    const { error } = await signInWithAzure();
    if (error) {
      setSubmitting(false);
      toast.error('Microsoft login is not available right now.');
    }
    // On success the browser redirects — no need to reset submitting
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8 bg-card-gradient border-border/60">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center overflow-hidden ring-1 ring-border mb-3">
            <img src={twoSeasonsLogo} alt="Two Seasons" className="w-full h-full object-contain p-1" />
          </div>
          <h1 className="font-display font-semibold text-xl">Two Seasons Insights</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {showReset ? 'Reset your password' : 'Sign in to continue'}
          </p>
        </div>

        {!showReset ? (
          <form onSubmit={handleSignIn} className="space-y-4">
            {lockoutMessage && (
              <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {lockoutMessage}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  placeholder="you@2seasonshotels.com"
                  autoComplete="username"
                  disabled={submitting || isLockedOut}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                <PasswordInput
                  id="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !submitting && !isLockedOut && email && password) {
                      e.preventDefault();
                      handleSignIn(e as unknown as React.FormEvent);
                    }
                  }}
                  className="pl-9"
                  autoComplete="current-password"
                  disabled={submitting || isLockedOut}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="remember-me" className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(v) => setRememberMe(v === true)}
                  disabled={submitting || isLockedOut}
                />
                Remember me
              </label>
            </div>

            <Button type="submit" className="w-full" disabled={submitting || isLockedOut}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Sign in
            </Button>

            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center justify-center gap-2"
              onClick={handleAzureSignIn}
              disabled={submitting || isLockedOut}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 21 21"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <rect x="0" y="0" width="10" height="10" fill="#F25022" />
                <rect x="11" y="0" width="10" height="10" fill="#7FBA00" />
                <rect x="0" y="11" width="10" height="10" fill="#00A4EF" />
                <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
              </svg>
              Sign in with Microsoft
            </Button>

            <button
              type="button"
              onClick={() => {
                setResetEmail(email);
                setShowReset(true);
              }}
              disabled={submitting}
              className="block w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
            >
              Forgot your password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            {urlAuthError && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
                {urlAuthError} Enter your email below to request a new one.
              </div>
            )}
            {resetLockoutMessage && (
              <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {resetLockoutMessage}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@2seasonshotels.com"
                disabled={submitting || resetLockedOut}
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting || resetLockedOut}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Send reset link
            </Button>

            <button
              type="button"
              onClick={() => setShowReset(false)}
              className="block w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Back to sign in
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Access is invitation-only. Contact your administrator for an account.
        </p>
      </Card>
    </div>
  );
};

export default AuthPage;
