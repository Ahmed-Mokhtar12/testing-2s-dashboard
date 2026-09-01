import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import twoSeasonsLogo from '@/assets/two-seasons-logo-full.png';
import { parseCallbackUrl } from '@/lib/auth-callback-url';

const ALLOWED_DOMAIN = '@2seasonshotels.com';

type Status = 'loading' | 'denied' | 'cancelled' | 'error';

const AuthCallback: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [urlFacts] = useState(() => parseCallbackUrl(window.location.search, window.location.hash));
  const [status, setStatus] = useState<Status>(urlFacts.error ? 'cancelled' : 'loading');
  const [rejectedEmail, setRejectedEmail] = useState<string | null>(null);
  const errorDescription = urlFacts.description;

  // supabase-js runs the IMPLICIT flow by default, so GoTrue returns here with the result in
  // the HASH (see src/lib/auth-callback-url.ts). Reading only ?code= meant every result bounced
  // to /auth before the domain check or the error cards could run (audit A7/W1).
  //
  // The status is derived SYNCHRONOUSLY from the URL rather than in an effect: this route is
  // lazy-loaded, so by the time it mounts the AuthProvider has usually finished (loading =
  // false), and an effect-driven setStatus('cancelled') batched with the auth-result effect's
  // setStatus('error') in the same commit — the latter won and every provider error rendered
  // as "Sign-in failed". Caught by tests/auth-callback.spec.ts.
  useEffect(() => {
    if (!urlFacts.hasResult) {
      navigate('/auth', { replace: true });
    }
  }, [navigate, urlFacts.hasResult]);

  // Handle auth result once Supabase finishes exchanging the code
  useEffect(() => {
    if (loading) return;
    if (status !== 'loading') return;

    if (user) {
      const email = user.email ?? '';
      const [, emailDomain] = email.toLowerCase().split('@');
      if (emailDomain === '2seasonshotels.com') {
        navigate('/', { replace: true });
      } else {
        setRejectedEmail(email);
        setStatus('denied');
        signOut().then(({ error }) => {
          if (error && import.meta.env.DEV) console.warn('Post-rejection signOut failed:', error);
        });
      }
    } else {
      setStatus('error');
    }
  }, [loading, user, status, navigate, signOut]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8 bg-card-gradient border-border/60">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center overflow-hidden ring-1 ring-border mb-3">
            <img
              src={twoSeasonsLogo}
              alt="Two Seasons"
              className="w-full h-full object-contain p-1"
            />
          </div>
          <h1 className="font-display font-semibold text-xl">Two Seasons Insights</h1>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Signing you in…</p>
          </div>
        )}

        {status === 'denied' && (
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <p className="font-medium mb-1">Access Denied</p>
              <p>
                {rejectedEmail} is not authorised to access this dashboard.
                Only {ALLOWED_DOMAIN} accounts are permitted.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/auth', { replace: true })}
            >
              Back to sign in
            </Button>
          </div>
        )}

        {status === 'cancelled' && (
          <div className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              Microsoft sign-in was cancelled.
            </p>
            {errorDescription && (
              <p className="text-xs text-center text-muted-foreground" data-testid="auth-callback-error">
                {errorDescription}
              </p>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/auth', { replace: true })}
            >
              Back to sign in
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              Sign-in failed. Please try again.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/auth', { replace: true })}
            >
              Back to sign in
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AuthCallback;
