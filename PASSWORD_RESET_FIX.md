# Password Reset Fix Plan

## Diagnosis Summary

After reading the live Supabase auth logs, **the emails ARE being delivered** — the reset email arrives within ~23 seconds of being requested. The problem is that the `/reset-password` page has a **race condition** that causes it to show "Invalid or expired link" immediately after the token is successfully exchanged, before the user sees the form. The user then clicks the link again → the token is already consumed → permanent error.

### Evidence from Supabase Logs (today, 15 May 2026)
```
08:07:29  Reset email requested            ← email sent
08:07:52  Token verified → session created ← user clicked the link (SUCCESS in 23 sec)
08:07:55  Session confirmed                ← app is authenticated
08:08:35  "One-time token not found"       ← user clicked the link AGAIN (token gone)
08:08:39  "One-time token not found"       ← same
08:11:32  "One-time token not found"       ← same
08:20:46  Login succeeded                  ← user logged in with password
```

---

## Phase 1 — Fix the Supabase Dashboard (Manual, ~5 min)

These are configuration changes you make directly in the Supabase dashboard — no code needed.

### Step 1.1 — Fix the Broken Invite Email Template

The auth logs show a template error breaking all invite emails:
> `templatemailer: template type "invite": function "https" not defined`

**How to fix:**
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard/project/yczcebfaqerlwfalrbjn) → **Authentication → Email Templates → Invite User**
2. Look for a line containing `{{ https://... }}` — a raw URL inside double-braces
3. Remove the `{{ }}` around it so it becomes a plain HTML link, or click **"Reset to default"** to restore the original template

### Step 1.2 — Confirm Redirect URL is Whitelisted

*(Already confirmed working from logs, but verify it's there for safety.)*

1. Go to **Authentication → URL Configuration**
2. Make sure **Site URL** = `https://2s-dashboard.digitlab.ai`
3. Under **Redirect URLs**, confirm `https://2s-dashboard.digitlab.ai/reset-password` is listed

---

## Phase 2 — Fix the Race Condition in `ResetPassword.tsx` (Primary Bug)

**File:** `src/pages/ResetPassword.tsx`

**The problem:** After `verifyOtp` succeeds, `setReady(true)` fires before `user` from `AuthContext` has propagated through React's state. The render checks `if (!user)` and shows "Invalid or expired link" — even though the session is valid.

**The fix:** Track a local `sessionReady` flag so the form shows as soon as the session is confirmed, independently of whether `user` has propagated from `AuthContext`.

### Change 1 — Add `sessionReady` state and use it in error handling

In `src/pages/ResetPassword.tsx`:

1. Add a new state at the top of the component (after existing `useState` declarations):
```typescript
const [sessionReady, setSessionReady] = useState(false);
```

2. Inside `init()`, after the successful `verifyOtp` block (currently lines 62–75), add `setSessionReady(true)` after `window.history.replaceState`:

**Current code (lines 62–75):**
```typescript
if (tokenHash && type) {
  const { error } = await supabase.auth.verifyOtp({
    type: type as 'recovery',
    token_hash: tokenHash,
  });
  if (error) {
    if (import.meta.env.DEV) console.error('verifyOtp failed:', error);
    if (!cancelled) {
      setExchangeError(error.message);
      setReady(true);
    }
    return;
  }
  window.history.replaceState({}, '', url.pathname);
```

**Replace with:**
```typescript
if (tokenHash && type) {
  const { error } = await supabase.auth.verifyOtp({
    type: type as 'recovery',
    token_hash: tokenHash,
  });
  if (error) {
    if (import.meta.env.DEV) console.error('verifyOtp failed:', error);
    // Token already consumed — check if a valid session exists from a prior click
    const { data: { session: existing } } = await supabase.auth.getSession();
    if (!cancelled) {
      if (existing) {
        setSessionReady(true); // session from a prior click — show the form
      } else {
        setExchangeError(error.message);
      }
      setReady(true);
    }
    return;
  }
  window.history.replaceState({}, '', url.pathname);
```

3. In the same block, after `window.history.replaceState(...)`, add `setSessionReady(true)` before the `await` delay:

**Current code (lines 75–101) — after the replaceState:**
```typescript
  window.history.replaceState({}, '', url.pathname);
} else if (code) {
```

**Add to the verifyOtp success path (right after replaceState inside the `if (tokenHash && type)` block):**
```typescript
  window.history.replaceState({}, '', url.pathname);
  setSessionReady(true); // ← ADD THIS LINE
```

4. Same fix for the `exchangeCodeForSession` path (lines 76–87). After `window.history.replaceState` in the `else if (code)` block, also add `setSessionReady(true)`:
```typescript
} else if (code) {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    ...
    return;
  }
  window.history.replaceState({}, '', url.pathname);
  setSessionReady(true); // ← ADD THIS LINE
}
```

### Change 2 — Fix the render condition

**Current code (lines 164–176):**
```typescript
if (!user) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <h2 className="font-display font-semibold mb-2">Invalid or expired link</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {exchangeError ? exchangeError : 'Please request a new password reset link.'}
        </p>
        <Button onClick={() => navigate('/auth')}>Back to sign in</Button>
      </Card>
    </div>
  );
}
```

**Replace with:**
```typescript
if (!sessionReady && !user) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <h2 className="font-display font-semibold mb-2">Invalid or expired link</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {exchangeError ? exchangeError : 'Please request a new password reset link.'}
        </p>
        <Button onClick={() => navigate('/auth')}>Back to sign in</Button>
      </Card>
    </div>
  );
}
```

**Why this works:** The form now shows if either the `AuthContext` `user` is set (normal path) OR `sessionReady` is true (set immediately after the successful token exchange in the same effect, before any async delays).

---

## Phase 3 — Fix Recovery Token Detection Bugs (Minor)

These bugs affect an edge case: if Supabase ever ignores the `redirectTo` and sends the reset link to the site root (`/`) instead of `/reset-password`, the app won't detect the token and won't redirect the user to the reset form.

### Fix in `src/contexts/AuthContext.tsx` (line 24)

**Current (buggy):**
```typescript
if (type === 'recovery' || (hasRecoveryToken && type === 'recovery')) {
  setIsRecovering(true);
}
```

**Replace with:**
```typescript
if (type === 'recovery' || url.searchParams.has('code') || hashParams.has('access_token')) {
  setIsRecovering(true);
}
```

### Fix in `src/components/ProtectedRoute.tsx` (line 13)

**Current (buggy):**
```typescript
if (url.searchParams.has('code') && type === 'recovery') return true;
```

**Replace with:**
```typescript
if (url.searchParams.has('code')) return true;
```

---

## Phase 4 — Verify Everything Works End-to-End

After completing Phases 1–3:

1. **Build and deploy** (or test locally with `npm run dev`)
2. **Log out** of the app
3. Go to `/auth` → click **"Forgot your password?"**
4. Enter `ahmed.mokhtar@2seasonshotels.com` and submit
5. **Check your inbox** — the email should arrive within ~30 seconds
6. **Click the reset link** in the email — you should land on `/reset-password` with the **"Set a new password" form visible** (not the error card)
7. Enter a strong new password and submit → you should be redirected to `/auth`
8. Log in with the new password to confirm the full flow worked

---

## Files Changed

| File | Phase | What Changed |
|------|-------|-------------|
| `src/pages/ResetPassword.tsx` | Phase 2 | Add `sessionReady` state; fix race condition; handle already-consumed token gracefully |
| `src/contexts/AuthContext.tsx` | Phase 3 | Fix recovery detection condition (line 24) |
| `src/components/ProtectedRoute.tsx` | Phase 3 | Fix PKCE recovery detection (line 13) |
| Supabase Dashboard | Phase 1 | Fix invite email template; verify redirect URL |
