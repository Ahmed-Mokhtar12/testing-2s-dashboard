# Azure AD Login — Design Spec

**Date:** 2026-06-09
**Project:** Two Seasons Insights Dashboard
**Feature:** Sign in with Microsoft (Azure AD) via Supabase OAuth

---

## Overview

Add a "Sign in with Microsoft" button to the existing `/auth` login page.
Authentication goes through Supabase's Azure OAuth provider using PKCE.
After Microsoft login, a dedicated `/auth/callback` route performs a domain check
and either admits the user or rejects them with a clear error — before any protected
route is reached.

The existing email/password flow is untouched.

---

## Scope

**In scope:**
- Azure App Registration configuration (steps documented, not automated)
- Supabase Azure provider configuration (steps documented)
- `signInWithAzure()` method added to `AuthContext`
- "Sign in with Microsoft" button on `Auth.tsx`
- New `AuthCallback.tsx` page with domain check, success redirect, and error UI
- New `/auth/callback` route registered in `App.tsx`

**Out of scope:**
- Changes to any dashboard page
- Changes to `ProtectedRoute`, `useAuth`, or any other auth consumer
- Rate limiting on the Microsoft button (Azure + Supabase handle this server-side)
- Supabase Edge Function auth hooks

---

## Architecture

```
Azure Portal          Supabase              React App
──────────────        ────────────          ──────────────────────────────
App Registration  →   Azure provider    →   AuthContext  +  signInWithAzure()
  Client ID           configured with         ↓
  Client Secret       Tenant ID           /auth page  (new button)
  Redirect URI →                              ↓
    /auth/callback                        /auth/callback  (new route)
                                            ↓           ↓
                                         ✅ domain OK  ❌ wrong domain
                                            ↓               ↓
                                         → dashboard    signOut() + error card
```

**Files changed:**
| File | Change |
|------|--------|
| `src/contexts/auth-context.ts` | Add `signInWithAzure()` to `AuthContextValue` interface |
| `src/contexts/AuthContext.tsx` | Implement `signInWithAzure()` |
| `src/pages/Auth.tsx` | Add Microsoft button + divider (hidden on reset view) |
| `src/pages/AuthCallback.tsx` | New page — domain check, success redirect, error card |
| `src/App.tsx` | Register `/auth/callback` route |

---

## Data Flow

```
1. User clicks "Sign in with Microsoft"
   └─ signInWithAzure() calls:
      supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: { redirectTo: 'https://testing-2s-dashboard.digitlab.ai/auth/callback' }
      })
   └─ Browser redirects to Microsoft login

2. User authenticates on Microsoft
   └─ Microsoft redirects to:
      https://testing-2s-dashboard.digitlab.ai/auth/callback?code=...

3. /auth/callback mounts
   └─ Supabase JS detects ?code= and exchanges it for a session (PKCE, automatic)
   └─ onAuthStateChange fires → SIGNED_IN

4. AuthCallback reads session user email
   └─ email ends with @2seasonshotels.com?

   ✅ YES → navigate('/', { replace: true })
   ❌ NO  → await supabase.auth.signOut()
            render error card with rejected email
```

---

## Domain Restriction

- **Allowed domain:** `@2seasonshotels.com`
- **Check location:** `AuthCallback.tsx`, after `onAuthStateChange` fires `SIGNED_IN`
- **Provisioning:** First-time valid Azure login auto-creates a Supabase user — no admin invite required
- **Rejection:** Session is destroyed client-side via `signOut()` before any protected route is reached

The domain constant is defined once at the top of `AuthCallback.tsx`:
```ts
const ALLOWED_DOMAIN = '@2seasonshotels.com';
```

---

## UI

### `/auth` — Microsoft button (sign-in view only)

Positioned after the primary "Sign in" button, separated by an `or` divider.
Hidden when the password-reset form is active (`showReset === true`).

```
[        Sign in         ]

──────────── or ────────────

[⊞  Sign in with Microsoft ]

Forgot your password?
```

Button: `variant="outline"`, full-width, Microsoft logo SVG inline (no external dep).
Disabled while `submitting` is true (same guard as the email/password button).

### `/auth/callback` — two states

**Loading (auto-redirects ~0.5 s):**
```
[Logo]  Two Seasons Insights
        Signing you in…  ◌
```

**Rejected (stays until user acts):**
```
[Logo]  Two Seasons Insights

        Access Denied

        user@example.com is not authorised to access
        this dashboard. Only @2seasonshotels.com
        accounts are permitted.

        [ Back to sign in ]
```

Both states use the same `Card` + logo header as `Auth.tsx` for visual consistency.

---

## Error Handling

| Scenario | Detection | Response |
|----------|-----------|----------|
| User cancels Microsoft login | `?error=access_denied` in callback URL (no `?code=`) | Show "Sign-in was cancelled" card, back link to `/auth` |
| Azure provider not configured in Supabase | `signInWithOAuth` rejects immediately | Toast error on `/auth`: "Microsoft login is not available right now." |
| Supabase code exchange fails (expired/replayed) | `onAuthStateChange` fires without a valid session | Show "Sign-in failed. Please try again." card, back link to `/auth` |
| Direct navigation to `/auth/callback` with no code | No `?code=`, no session, no error on mount | Immediate redirect to `/auth` |
| Wrong domain | Email domain does not match `ALLOWED_DOMAIN` | `signOut()` then show "Access Denied" card with rejected email |

---

## Pre-Implementation Setup (manual steps)

These must be completed before the code changes are deployed:

### Azure Portal
1. Register a new App in Azure Active Directory → App registrations
2. Supported account types: **Accounts in this organizational directory only (Single tenant)**
3. Add Redirect URI: `https://yczcebfaqerlwfalrbjn.supabase.co/auth/v1/callback` (Web platform)
4. Copy: **Application (client) ID** and **Directory (tenant) ID**
5. Certificates & Secrets → New client secret → Copy the **Value** (shown once)

### Supabase Dashboard
1. Go to: Authentication → Providers → Azure
2. Enable Azure provider
3. Paste: Client ID, Client Secret, Azure Tenant ID
4. Save

---

## Testing Checklist

- [ ] Valid `@2seasonshotels.com` Azure account → lands on dashboard
- [ ] Non-company Microsoft account → "Access Denied" card shown, session destroyed
- [ ] Cancel Microsoft login mid-flow → "Cancelled" message, no session created
- [ ] Direct navigation to `/auth/callback` → redirect to `/auth`
- [ ] Existing email/password flow still works unchanged
- [ ] Password reset flow still works unchanged
- [ ] Page refresh while logged in via Azure → stays logged in (session persists)
- [ ] Sign out after Azure login → returns to `/auth`
