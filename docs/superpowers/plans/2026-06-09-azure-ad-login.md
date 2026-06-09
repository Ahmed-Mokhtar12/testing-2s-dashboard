# Azure AD Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Sign in with Microsoft" (Azure AD, single-tenant, @2seasonshotels.com only) to the existing Supabase-backed login page via a dedicated `/auth/callback` route.

**Architecture:** `signInWithAzure()` in `AuthContext` starts the PKCE OAuth flow; Microsoft redirects to `/auth/callback`; that page waits for Supabase to exchange the code, checks the email domain, and either navigates to the dashboard or destroys the session and shows an "Access Denied" card.

**Tech Stack:** React 18, TypeScript, Vite, `@supabase/supabase-js` v2, react-router-dom v6, shadcn/ui (Button, Card), Sonner toasts, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/contexts/auth-context.ts` | Modify | Add `signInWithAzure` to the `AuthContextValue` interface |
| `src/contexts/AuthContext.tsx` | Modify | Implement `signInWithAzure()` using `supabase.auth.signInWithOAuth` |
| `src/pages/AuthCallback.tsx` | **Create** | Domain check page — success redirect or error card |
| `src/App.tsx` | Modify | Register the `/auth/callback` route (lazy-loaded) |
| `src/pages/Auth.tsx` | Modify | Add Microsoft button + `or` divider to the sign-in form |

---

## Task 0: Manual prerequisites — Azure Portal + Supabase config

> These must be done before any code change is deployed. The feature will silently fail without them.

- [ ] **Step 1: Register the app in Azure Portal**

  1. Go to [portal.azure.com](https://portal.azure.com) → **Azure Active Directory** → **App registrations** → **New registration**
  2. Name: `Two Seasons Insights Dashboard`
  3. Supported account types: **Accounts in this organizational directory only (Single tenant)**
  4. Redirect URI: Platform = **Web**, URI = `https://yczcebfaqerlwfalrbjn.supabase.co/auth/v1/callback`
  5. Click **Register**

- [ ] **Step 2: Copy the Azure credentials**

  From the newly registered app's **Overview** page, copy and save:
  - **Application (client) ID** — looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
  - **Directory (tenant) ID** — same format

- [ ] **Step 3: Create a client secret**

  1. In the app → **Certificates & secrets** → **New client secret**
  2. Description: `supabase`, Expires: 24 months
  3. Click **Add** — **copy the secret Value immediately** (it is only shown once)

- [ ] **Step 4: Configure Supabase Azure provider**

  1. Go to [supabase.com/dashboard/project/yczcebfaqerlwfalrbjn/auth/providers](https://supabase.com/dashboard/project/yczcebfaqerlwfalrbjn/auth/providers)
  2. Expand **Azure** → toggle **Enable Azure provider**
  3. Fill in:
     - **Client ID**: paste the Application (client) ID from Step 2
     - **Client Secret**: paste the secret Value from Step 3
     - **Azure Tenant URL**: `https://login.microsoftonline.com/<Directory-tenant-ID>` (replace with real tenant ID)
  4. Click **Save**

- [ ] **Step 5: Add the callback URL to Supabase allowed redirects**

  1. Go to [supabase.com/dashboard/project/yczcebfaqerlwfalrbjn/auth/url-configuration](https://supabase.com/dashboard/project/yczcebfaqerlwfalrbjn/auth/url-configuration)
  2. Under **Redirect URLs**, add: `https://testing-2s-dashboard.digitlab.ai/auth/callback`
  3. Save

---

## Task 1: Extend AuthContext with `signInWithAzure`

**Files:**
- Modify: `src/contexts/auth-context.ts`
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Add `signInWithAzure` to the interface**

  Open `src/contexts/auth-context.ts`. The current interface ends at `updatePassword`. Add one line:

  ```ts
  export interface AuthContextValue {
    user: User | null;
    session: Session | null;
    loading: boolean;
    isRecovering: boolean;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<{ error: Error | null }>;
    resetPassword: (email: string) => Promise<{ error: Error | null }>;
    updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
    signInWithAzure: () => Promise<{ error: Error | null }>;
  }
  ```

- [ ] **Step 2: Implement `signInWithAzure` in AuthContext.tsx**

  Open `src/contexts/AuthContext.tsx`. After the existing `const signIn = ...` function (around line 61), add:

  ```ts
  const signInWithAzure = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'email profile openid',
      },
    });
    return { error };
  };
  ```

- [ ] **Step 3: Expose it in the context value**

  In the same file, find the `<AuthContext.Provider value={{ ... }}>` call (around line 122). Add `signInWithAzure` to the value object:

  ```tsx
  <AuthContext.Provider value={{
    user, session, loading, isRecovering,
    signIn, signOut, resetPassword, updatePassword,
    signInWithAzure,
  }}>
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
  npx tsc --noEmit 2>&1
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git -C /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai \
    add src/contexts/auth-context.ts src/contexts/AuthContext.tsx && \
  git -C /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai \
    commit -m "feat(auth): add signInWithAzure to AuthContext"
  ```

---

## Task 2: Create `AuthCallback.tsx`

**Files:**
- Create: `src/pages/AuthCallback.tsx`

- [ ] **Step 1: Create the file**

  Create `src/pages/AuthCallback.tsx` with the following content:

  ```tsx
  import React, { useEffect, useState } from 'react';
  import { useNavigate } from 'react-router-dom';
  import { useAuth } from '@/hooks/useAuth';
  import { Card } from '@/components/ui/card';
  import { Button } from '@/components/ui/button';
  import { Loader2 } from 'lucide-react';
  import twoSeasonsLogo from '@/assets/two-seasons-logo-full.png';

  const ALLOWED_DOMAIN = '@2seasonshotels.com';

  type Status = 'loading' | 'denied' | 'cancelled' | 'error';

  const AuthCallback: React.FC = () => {
    const { user, loading, signOut } = useAuth();
    const navigate = useNavigate();
    const [status, setStatus] = useState<Status>('loading');
    const [rejectedEmail, setRejectedEmail] = useState<string | null>(null);

    // Check URL on mount for cancellation or missing code
    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const hasCode = params.has('code');
      const urlError = params.get('error');

      if (urlError) {
        setStatus('cancelled');
        return;
      }

      if (!hasCode) {
        navigate('/auth', { replace: true });
      }
    }, [navigate]);

    // Handle auth result once Supabase finishes exchanging the code
    useEffect(() => {
      if (loading) return;
      if (status !== 'loading') return;

      if (user) {
        const email = user.email ?? '';
        if (email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
          navigate('/', { replace: true });
        } else {
          setRejectedEmail(email);
          setStatus('denied');
          signOut();
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
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
  npx tsc --noEmit 2>&1
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git -C /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai \
    add src/pages/AuthCallback.tsx && \
  git -C /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai \
    commit -m "feat(auth): add AuthCallback page with domain check"
  ```

---

## Task 3: Register `/auth/callback` route in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the lazy import**

  Open `src/App.tsx`. After line 24 (`const NotFound = lazy(...)`), add:

  ```tsx
  const AuthCallback = lazy(() => import("./pages/AuthCallback"));
  ```

- [ ] **Step 2: Register the route**

  In the `<Routes>` block, after the existing `/reset-password` route (line 56), add:

  ```tsx
  <Route path="/auth/callback" element={<AuthCallback />} />
  ```

  The routes block should now read:

  ```tsx
  <Route path="/auth" element={<AuthPage />} />
  <Route path="/reset-password" element={<ResetPasswordPage />} />
  <Route path="/auth/callback" element={<AuthCallback />} />
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
  npx tsc --noEmit 2>&1
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git -C /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai \
    add src/App.tsx && \
  git -C /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai \
    commit -m "feat(auth): register /auth/callback route"
  ```

---

## Task 4: Add Microsoft button to Auth.tsx

**Files:**
- Modify: `src/pages/Auth.tsx`

- [ ] **Step 1: Expose `signInWithAzure` from `useAuth`**

  Open `src/pages/Auth.tsx`. On line 54, find:

  ```tsx
  const { user, loading, isRecovering, signIn, resetPassword } = useAuth();
  ```

  Replace with:

  ```tsx
  const { user, loading, isRecovering, signIn, signInWithAzure, resetPassword } = useAuth();
  ```

- [ ] **Step 2: Add the `handleAzureSignIn` handler**

  After the closing brace of `handleReset` (around line 217), add:

  ```tsx
  const handleAzureSignIn = async () => {
    setSubmitting(true);
    const { error } = await signInWithAzure();
    if (error) {
      setSubmitting(false);
      toast.error('Microsoft login is not available right now.');
    }
    // On success the browser redirects — no need to reset submitting
  };
  ```

- [ ] **Step 3: Add the divider and Microsoft button in the JSX**

  In the sign-in form (`!showReset` branch), locate the `<Button type="submit" ...>Sign in</Button>` block (around line 292). After that button and before the `<button ... >Forgot your password?</button>`, insert:

  ```tsx
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
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
  npx tsc --noEmit 2>&1
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git -C /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai \
    add src/pages/Auth.tsx && \
  git -C /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai \
    commit -m "feat(auth): add Sign in with Microsoft button to login page"
  ```

---

## Task 5: Build, deploy and verify

- [ ] **Step 1: Build**

  ```bash
  cd /home/digitlab-testing-2s-dashboard/htdocs/testing-2s-dashboard.digitlab.ai
  npm run build 2>&1
  ```

  Expected: `✓ built in X.XXs` with no TypeScript errors. The chunk warning about file size is normal and can be ignored.

- [ ] **Step 2: Restart the pm2 process**

  ```bash
  pm2 restart testing-2s-dashboard 2>&1
  ```

  Expected:
  ```
  [PM2] Applying action restartProcessId on app [testing-2s-dashboard](ids: [ 2 ])
  [PM2] [testing-2s-dashboard](2) ✓
  ```

- [ ] **Step 3: Confirm the site returns 200**

  ```bash
  curl -sI https://testing-2s-dashboard.digitlab.ai/ | head -5
  ```

  Expected: `HTTP/2 200`

- [ ] **Step 4: Smoke-test the callback route returns 200**

  ```bash
  curl -sI https://testing-2s-dashboard.digitlab.ai/auth/callback | head -5
  ```

  Expected: `HTTP/2 200` (the SPA serves `index.html` for all routes; the React app handles the redirect to `/auth` because there's no `?code=` present)

- [ ] **Step 5: Manual checklist — complete after Task 0 (Azure + Supabase config) is done**

  Open `https://testing-2s-dashboard.digitlab.ai/auth` in a browser and verify each:

  - [ ] "Sign in with Microsoft" button is visible below the email/password form
  - [ ] The `or` divider appears between the Sign in button and the Microsoft button
  - [ ] The Microsoft button is hidden when the password-reset form is showing
  - [ ] Clicking the Microsoft button redirects to Microsoft login page
  - [ ] Signing in with a valid `@2seasonshotels.com` account → lands on the dashboard
  - [ ] Signing in with a non-company Microsoft account → "Access Denied" card shows the rejected email
  - [ ] Clicking "Back to sign in" on the Access Denied card → returns to `/auth`
  - [ ] Cancelling the Microsoft login mid-flow → "Microsoft sign-in was cancelled" card
  - [ ] Visiting `/auth/callback` directly with no `?code=` → redirects to `/auth`
  - [ ] Existing email/password sign-in still works
  - [ ] Existing password-reset flow still works
  - [ ] Refreshing the page while logged in via Azure → stays logged in
  - [ ] Signing out after Azure login → returns to `/auth`
