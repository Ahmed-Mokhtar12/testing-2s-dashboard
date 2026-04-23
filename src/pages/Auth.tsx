import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Mail, Lock } from 'lucide-react';
import twoSeasonsLogo from '@/assets/two-seasons-logo-full.png';

const AuthPage: React.FC = () => {
  const { user, loading, signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || '/';

  const [email, setEmail] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('ts_last_email') ?? '';
  });
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  useEffect(() => {
    if (!loading && user) navigate(from, { replace: true });
  }, [loading, user, navigate, from]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      toast.error(error.message || 'Sign-in failed');
    } else {
      try { localStorage.setItem('ts_last_email', email); } catch { /* ignore */ }
      toast.success('Welcome back');
      navigate(from, { replace: true });
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await resetPassword(resetEmail);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Check your inbox for the reset link');
      setShowReset(false);
    }
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
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Sign in
            </Button>

            <button
              type="button"
              onClick={() => { setResetEmail(email); setShowReset(true); }}
              className="block w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Forgot your password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@2seasonshotels.com"
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
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
