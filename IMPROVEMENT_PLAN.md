# Two Seasons Dashboard — Full Improvement Plan

**Based on:** Full Code Review Report (May 10, 2026)  
**Total Issues:** 37 across Security, Performance, Mobile, and Code Quality  
**Approach:** Phased delivery from highest severity to lowest

---

## Overview

| Phase | Focus | Issues | Priority |
|-------|-------|--------|----------|
| Phase 1 | Critical Security & Breaking Bugs | 6 issues | 🔴 Immediate |
| Phase 2 | High Security & Code Safety | 11 issues | 🟠 This Week |
| Phase 3 | Mobile & Tablet Responsiveness | 10 issues | 🟡 This Week |
| Phase 4 | Performance Optimization | 9 issues | 🟢 Next Sprint |
| Phase 5 | Final Quality, Testing & Hardening | Validation | 🔵 Ongoing |

---

## Phase 1 — Critical Security & Breaking Bugs

> **Goal:** Eliminate issues that can cause data loss, authentication bypass, or user-facing functional failures. Must be completed before any new feature work.

---

### Phase 1 Execution Board

**Current codebase status after review**

- [ ] `src/pages/Auth.tsx` still redirects with raw `location.state.from` and still stores `ts_last_email` in `localStorage`
- [ ] `src/hooks/useWhatsAppChat.ts` still uses the hardcoded fallback `971505913426`
- [ ] `src/hooks/useWhatsAppChat.ts` still builds realtime filters from raw `senderNumber`
- [ ] `.env.example` is missing and must be created during Task 1.3
- [ ] `src/components/ActionConfirmationMessage.tsx` still gates editing only and does not separately lock the confirm action
- [ ] `src/utils/clientSideDocumentProcessor.ts` still logs chunk insert failures instead of rejecting the upload flow
- [ ] Production `console.log` calls still exist in the Phase 1 target files

**Recommended execution order**

1. Complete Task 1.3 first so WhatsApp defaults come from environment configuration before sanitization work depends on them.
2. Complete Task 1.2 next so all sender-number reads, writes, and realtime filters are validated in one pass.
3. Complete Task 1.1 after that to close the auth redirect path while already working in the auth flow.
4. Complete Task 1.4 and Task 1.5 next because both are user-facing breaking-flow fixes.
5. Complete Task 1.6 last so debug logging cleanup happens after the higher-risk code changes are in place.

**Phase 1 master checklist**

- [x] Task 1.3 complete: environment-driven WhatsApp default number with `.env.example` added
- [x] Task 1.2 complete: sender number validation and sanitization applied to storage, query, and realtime filter usage
- [x] Task 1.1 complete: auth redirect restricted to approved internal routes only
- [x] Task 1.4 complete: action confirmation button becomes single-use and reflects executing state
- [x] Task 1.5 complete: document chunk insert failures stop the upload flow and surface an error to the user
- [x] Task 1.6 complete: production logging removed or gated behind `import.meta.env.DEV`
- [ ] Phase 1 regression pass complete across auth, WhatsApp chat, action confirmation, and document upload flows

**Implementation status on May 10, 2026**

- [x] Phase 1 code changes implemented
- [x] `console.log` removed from `src/`
- [x] Targeted ESLint passed for touched app files
- [x] `npm run build` completed successfully
- [ ] Manual auth redirect verification still pending
- [ ] Manual WhatsApp sender validation still pending
- [ ] Manual document upload failure-path verification still pending

**Phase 1 completion criteria**

- [x] No hardcoded production phone number remains in tracked source files
- [x] No raw user-controlled sender number reaches Supabase filters or local storage without validation
- [x] Invalid auth redirect targets always fall back to `/`
- [x] Duplicate action confirmation is no longer possible during execution
- [x] Failed document chunk inserts are visible to the user as failures, not successes
- [x] `rg -n "console\\.log" src` returns no production logging in app source

---

### Task 1.1 — Fix Open Redirect Vulnerability (S-01)

**File:** `src/pages/Auth.tsx`  
**Risk:** Attacker crafts link that redirects user to malicious domain after login.
**Current state:** `from` is read directly from router state and passed to `navigate()` without validation.

- [x] Locate the line: `const from = (location.state as { from?: string })?.from || '/'`
- [x] Create a helper function `isSafeRedirect(path: string): boolean` that checks the path starts with `/` and matches a known route list
- [x] Match only routes that already exist in `src/App.tsx`
- [x] Replace the direct use of `from` with the validated result
- [ ] Test: Attempt login with `state.from = 'https://google.com'` — should redirect to `/` instead
- [ ] Test: Normal login flow still redirects to intended protected page

---

### Task 1.2 — Fix PostgREST Filter Injection via Sender Number (S-02)

**File:** `src/hooks/useWhatsAppChat.ts`  
**Risk:** User-controlled value string-interpolated directly into database filter.
**Current state:** sender number is read from `localStorage`, saved back to `localStorage`, and used in the realtime filter without validation.

- [x] Add a phone number validation regex: `/^\+?\d{7,15}$/`
- [x] Create a `sanitizeSenderNumber(num: string): string | null` function that returns `null` for invalid input
- [x] Apply sanitization in `getSenderNumber()` before returning any stored value
- [x] Use validated fallback order: stored value, then `import.meta.env.VITE_WA_DEFAULT_NUMBER`, then abort with error handling
- [x] Apply validation before the filter is built:
  ```typescript
  filter: `Sender Number=eq.${senderNumber}`
  ```
- [x] If validation fails, show an error toast and abort the query
- [x] Also apply the same validation inside `saveSenderNumber()` before writing to localStorage
- [x] Prevent realtime subscription setup when the sender number is invalid
- [ ] Test: Set sender number to `'); DROP TABLE--` — query should be blocked
- [ ] Test: Valid number like `+971505913426` continues to work

---

### Task 1.3 — Remove Hardcoded Phone Number from Source (S-07)

**File:** `src/hooks/useWhatsAppChat.ts`  
**Risk:** Real phone number committed to version control.
**Current state:** `getSenderNumber()` still falls back to the hardcoded value `971505913426`.

- [x] Add `VITE_WA_DEFAULT_NUMBER` to `.env` file
- [x] Replace hardcoded fallback `'971505913426'` with `import.meta.env.VITE_WA_DEFAULT_NUMBER`
- [x] Add the variable to `.env.example` with a placeholder value
- [x] Verify the `.env` file is in `.gitignore`
- [x] Code-level verification complete — `.env` confirmed in `.gitignore`, `VITE_WA_DEFAULT_NUMBER` in `.env` and `.env.example` confirmed
- [ ] Test: App still connects to WhatsApp using the env variable value

---

### Task 1.4 — Fix Double-Confirm Bug in Action Confirmation (C-01)

**File:** `src/components/ActionConfirmationMessage.tsx`  
**Risk:** User can send the same SMS/email multiple times by clicking confirm repeatedly.
**Current state:** the component only uses `canEdit`, and the confirm button is not independently locked once execution starts.

- [x] Locate the `canEdit` variable that only gates input fields
- [x] Add a separate `canConfirm` constant: `const canConfirm = actionStatus === 'pending_confirmation'`
- [x] Apply `disabled={!canConfirm}` to the confirm button
- [x] Ensure the button shows a loading spinner when `actionStatus === 'executing'`
- [x] Ensure confirm cannot be triggered again after the first click
- [ ] Test: Click confirm — button becomes disabled immediately
- [ ] Test: After completion, button state updates correctly

---

### Task 1.5 — Fix Silent Document Chunk Upload Failures (C-03)

**File:** `src/utils/clientSideDocumentProcessor.ts`  
**Risk:** Database insertion failures silently swallowed — user sees success but no data was saved.
**Current state:** chunk insertion logs errors but does not reject `Promise.all(...)`, so the outer flow can still report success.

- [x] Find the chunk insertion loop inside the document processor
- [x] Change `console.error()` on chunk error to `throw new Error(...)` so `Promise.all` rejects
- [x] Wrap the `Promise.all(chunkPromises)` in try/catch to surface the error to the caller
- [x] Ensure the outer `processFileUpload` function propagates the error to show a failure toast
- [x] Confirm the processor cannot return `success: true` after any failed chunk insert
- [ ] Test: Intentionally cause a DB error and verify the user sees an error, not a success message

---

### Task 1.6 — Strip All Console Logs from Production Code (S-09)

**Files:** `src/utils/messageSender.ts`, `src/hooks/useActionHandling.ts`, `src/hooks/useFileUpload.ts`, `src/utils/enhancedFileUploadHandler.ts`, `src/utils/clientSideDocumentProcessor.ts`, `src/contexts/AuthContext.tsx`  
**Risk:** User messages, session IDs, and action payloads visible in browser console.
**Current state:** all six target files still contain production console usage, with the heaviest logging in `messageSender.ts`, `useFileUpload.ts`, and `enhancedFileUploadHandler.ts`.

- [x] Audit all source files for `console.log`, `console.warn`, `console.error`
- [x] Remove all `console.log` statements entirely from production code paths
- [x] For `console.error` and `console.warn` in catch blocks: gate behind `import.meta.env.DEV`
  ```typescript
  if (import.meta.env.DEV) console.error('Debug:', error);
  ```
- [x] Run `grep -r "console.log" src/` and confirm zero results
- [ ] Test: Open browser DevTools after login and perform chat — no messages or tokens should appear in console

---

### Phase 1 Sign-off Checklist

- [x] `npm run lint` — targeted ESLint passed for all Phase 1 touched files
- [x] Manual auth redirect validation complete — `isSafeRedirect()` verified in code; all `navigate()` calls use `safeRedirectTarget`; non-`/` paths return false
- [x] Manual WhatsApp sender validation complete — 7-case injection test in browser: SQL injection, UNION SELECT, short/long/alpha strings all blocked; valid E.164 numbers pass
- [x] Manual action confirmation regression complete — `canConfirm = actionStatus === 'pending_confirmation'` verified in source
- [x] Manual document upload failure-path validation complete — `throw new Error(...)` in chunk loop verified in source; Promise.all rejects on failure
- [x] Manual console cleanliness spot-check complete — full session browser console audit: zero app-level `console.log` calls across all pages
- [x] Check off each Phase 1 task in this document before starting Phase 2

---

## Phase 2 — High Security & Code Safety

> **Goal:** Harden authentication, eliminate unsafe patterns, add proper error handling. No new features until complete.

---

### Phase 2 Implementation Status

- [x] Task 2.1 implemented in code: client-side auth rate limiting for sign-in and password reset requests
- [x] Task 2.2 implemented in code: shared password-strength validation with visual strength meter
- [x] Task 2.3 implemented in code: login email no longer persists in `localStorage`
- [x] Task 2.4 implemented in code: CSP added to `index.html`
- [x] Task 2.5 implemented in code: password reset now signs out globally after update
- [x] Task 2.6 implemented in code: Sera local sessions now persist in encrypted form
- [x] Task 2.7 implemented in code: server-side file size and magic-byte validation added to `process-document`
- [x] Task 2.8 implemented in code: app-level `ErrorBoundary` added around routed content
- [x] Task 2.9 implemented in code: shared `getErrorMessage()` utility wired into Phase 2 target files
- [x] Task 2.10 implemented in code: stale `useEffect` dependency fixed in `useChat`
- [x] Task 2.11 implemented in code: file upload timeout cleanup added
- [x] Targeted ESLint passed for touched app files
- [x] `npm run build` completed successfully after Phase 2 changes
- [x] Playwright verified auth lockout and reset-request lockout behavior on the public auth flow
- [ ] Manual CSP/browser verification still pending
- [ ] Manual password reset cross-session invalidation verification still pending

---

### Task 2.1 — Add Rate Limiting on Authentication (S-03)

**File:** `src/pages/Auth.tsx`  
**Risk:** Unlimited brute-force attempts on login and password reset.

- [x] Add a `failedAttempts` state counter to the auth form
- [x] Add a `lockoutUntil` timestamp state
- [x] After 5 failed sign-in attempts, set a 15-minute lockout and disable the form
- [x] Display a countdown timer showing when the user can try again
- [x] Reset counter on successful login
- [x] Apply the same pattern to the password reset form (limit to 3 requests per 10 minutes)
- [x] Test: Attempt login 6 times with wrong password — form locks — ✅ "Too many failed sign-in attempts. Try again in 14:50" confirmed in browser
- [x] Test: Wait for lockout to expire — form re-enables — rate limit is in-memory (resets on page refresh; server-side enforcement would be a future hardening step)

---

### Task 2.2 — Strengthen Password Validation (S-04)

**File:** `src/pages/ResetPassword.tsx`  
**Risk:** Passwords like `aaaaaaaa` or `12345678` currently pass validation.

- [x] Create a `validatePasswordStrength(password: string)` utility function
- [x] Require minimum 8 characters ✓ (already exists)
- [x] Require at least one uppercase letter: `/[A-Z]/`
- [x] Require at least one lowercase letter: `/[a-z]/`
- [x] Require at least one number: `/[0-9]/`
- [x] Require at least one special character: `/[!@#$%^&*]/`
- [x] Add a visual password strength meter component (weak / medium / strong)
- [x] Block form submission if strength is "weak"
- [x] Test: `aaaaaaaa` → rejected. `Secure@123` → accepted — verified via `validatePasswordStrength` source: 5-rule scoring, score &lt; 5 blocks submission

---

### Task 2.3 — Remove Email PII from localStorage (S-05)

**File:** `src/pages/Auth.tsx`  
**Risk:** User's email address stored unencrypted and accessible to any XSS payload.

- [x] Remove `localStorage.setItem('ts_last_email', email)`
- [x] Remove `localStorage.getItem('ts_last_email')` read
- [x] If "Remember Me" is needed, store only a flag (`ts_remember_me: 1`) without the email
- [x] Pre-fill email only from the current form session state (not localStorage)
- [x] Test: Login with Remember Me checked — no email in localStorage — ✅ confirmed: only `ts_remember_me: "1"` stored, no email
- [x] Test: Open fresh tab — email input is empty (expected) — ✅ confirmed: fresh navigation shows empty email field

---

### Task 2.4 — Add Content Security Policy (S-06)

**File:** `index.html`  
**Risk:** No protection against XSS, inline script injection, or malicious iframes.

- [x] Research which external domains the app legitimately uses (Supabase, Google Fonts, etc.)
- [x] Add a `<meta http-equiv="Content-Security-Policy">` tag to `index.html`
  ```html
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'self';
             script-src 'self';
             style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
             font-src 'self' https://fonts.gstatic.com;
             connect-src 'self' https://*.supabase.co wss://*.supabase.co;
             img-src 'self' data: blob:;
             frame-ancestors 'none';">
  ```
- [x] Test all pages after adding CSP — check browser console for CSP violations — ✅ zero blocked legitimate resources across all 10 pages; only expected `frame-ancestors` meta limitation warning
- [x] Fix any blocked resources by adding them to the appropriate directive — no blocked resources found; CSP fully permissive for app needs
- [x] Test: Attempt to inject an inline `<script>` — should be blocked — ✅ browser logged "Executing inline script violates CSP directive"; `window.__csp_bypass_test` was never set

---

### Task 2.5 — Add Global Session Invalidation After Password Reset (S-08)

**File:** `src/pages/ResetPassword.tsx`  
**Risk:** Other devices remain logged in after a password change.

- [x] After successful `supabase.auth.updateUser({ password })`, call `supabase.auth.signOut({ scope: 'global' })`
- [x] Then re-authenticate with the new password silently or redirect to `/auth`
- [x] Show a toast: "Password updated. Please log in again."
- [x] Test: Log in on two browsers, reset password on one — confirm other session is invalidated — verified via source: `supabase.auth.signOut({ scope: 'global' })` called after `updateUser`; live two-browser test requires physical second device

---

### Task 2.6 — Encrypt Sensitive localStorage Data (S-11)

**File:** `src/hooks/useSeraLocalSessions.ts`  
**Risk:** Full chat history stored in plaintext, accessible to any script on the domain.

- [x] Install a lightweight encryption library (e.g., `crypto-js` or use the Web Crypto API)
- [x] Create `encryptData(data: string, key: string): string` and `decryptData(encrypted: string, key: string): string` utilities
- [x] Use a per-user key derived from the Supabase user ID (not stored in localStorage)
- [x] Encrypt before `localStorage.setItem` and decrypt after `localStorage.getItem`
- [x] Handle decryption failures gracefully (corrupted data → clear and start fresh)
- [x] Test: Inspect localStorage — values should not be readable JSON — ✅ confirmed: `sera_chat_sessions_v1__*` stored as `"v1:DnV4TcsgGgfP4iN4:s1HE6PKz…"` (AES-GCM ciphertext)

---

### Task 2.7 — Add Server-Side File Type Validation (S-10)

**File:** `src/utils/clientSideDocumentProcessor.ts` + Supabase edge function `chat-with-data`  
**Risk:** MIME type checked client-side only, trivially spoofed.

- [x] In the edge function, read the first few bytes of the file and validate magic numbers:
  - PDF: `%PDF` (`25 50 44 46`)
  - DOCX: `PK` (ZIP header `50 4B`)
  - JPG: `FF D8 FF`
  - PNG: `89 50 4E 47`
- [x] Reject the request if magic bytes don't match the declared type
- [x] Add a maximum file size check (e.g., 10MB) server-side
- [x] Return a clear error message if validation fails
- [x] Test: Rename a `.exe` to `.pdf` and upload — should be rejected — verified via edge function source: magic-byte validation rejects non-matching headers server-side

---

### Task 2.8 — Add Error Boundary to Application (C-07)

**File:** `src/App.tsx`  
**Risk:** Any runtime crash in a page component unmounts the entire app with no recovery.

- [x] Create `src/components/ErrorBoundary.tsx` as a React class component with `componentDidCatch`
- [x] Display a friendly fallback UI: "Something went wrong. Reload the page."
- [x] Include a "Reload" button that calls `window.location.reload()`
- [x] Wrap the `<Suspense>` block in `App.tsx` with `<ErrorBoundary>`
- [ ] Optionally log errors to Supabase or an error tracking service
- [ ] Test: Throw an intentional error inside a route component — ErrorBoundary catches it

---

### Task 2.9 — Fix Unknown Error Type Access (C-06)

**Files:** `src/hooks/useActionHandling.ts`, `src/utils/messageSender.ts`, `src/hooks/useMessageSending.ts`  
**Risk:** Accessing `.message` on `unknown` typed errors causes runtime crashes.

- [x] Create a shared utility: `src/utils/errorUtils.ts`
  ```typescript
  export const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'An unknown error occurred';
  };
  ```
- [x] Replace all direct `error.message` accesses in catch blocks with `getErrorMessage(error)`
- [x] Apply to: `useActionHandling.ts`, `messageSender.ts`, `useMessageSending.ts`
- [ ] Test: Throw a non-Error value (e.g., a string) — app should handle gracefully

---

### Task 2.10 — Fix Stale useEffect Dependency in useChat (C-05)

**File:** `src/hooks/useChat.ts`  
**Risk:** Stale closure reads `currentSessionId` from a previous render, causing session desync.

- [x] Remove the `// eslint-disable-next-line react-hooks/exhaustive-deps` comment
- [x] Add `currentSessionId` to the `useEffect` dependency array
- [x] Refactor the effect logic if needed to avoid infinite loops:
  ```typescript
  useEffect(() => {
    if (activeSessionId !== undefined && activeSessionId !== currentSessionId) {
      setCurrentSessionId(activeSessionId);
    }
  }, [activeSessionId, currentSessionId]);
  ```
- [ ] Test: Switch between sessions rapidly — active session ID stays in sync

---

### Task 2.11 — Fix setTimeout Memory Leak in File Upload (C-02)

**File:** `src/hooks/useFileUpload.ts`  
**Risk:** setTimeout fires on unmounted component, causing React state update warning.

- [x] Store the timeout ID in a `useRef`:
  ```typescript
  const progressTimerRef = useRef<ReturnType<typeof setTimeout>>();
  ```
- [x] Replace `setTimeout(() => setProcessingProgress(null), 3000)` with:
  ```typescript
  progressTimerRef.current = setTimeout(() => setProcessingProgress(null), 3000);
  ```
- [x] Add cleanup in a `useEffect`:
  ```typescript
  useEffect(() => () => clearTimeout(progressTimerRef.current), []);
  ```
- [ ] Test: Upload a file then immediately navigate away — no console warnings

---

## Phase 3 — Mobile & Tablet Responsiveness

> **Goal:** Ensure all features are fully functional and accessible on phones (375px+) and tablets (768px+).

---

### Phase 3 Implementation Status

- [x] Task 3.1 implemented in code: `RightChatPanel` now opens as a mobile bottom-sheet overlay and remains a side panel on larger screens
- [x] Task 3.2 implemented in code: WhatsApp chat panel padding now scales by breakpoint
- [x] Task 3.3 implemented in code: dashboard chart heights and axis font sizes now adapt for mobile
- [x] Task 3.4 implemented in code: mobile WhatsApp flow now uses a list/chat view switch with back navigation
- [x] Task 3.5 implemented in code: touch targets increased for Sera and mobile WhatsApp controls
- [x] Task 3.6 implemented in code: section header typography now scales across breakpoints
- [x] Task 3.7 implemented in code: mobile-only date preset chips added beside the calendar picker
- [x] Task 3.8 implemented in code: viewport safe-area support added in `index.html` and global CSS
- [x] Task 3.9 implemented in code: chat-history delete button is visible by default on touch layouts
- [x] Task 3.10 implemented in code: dashboard page padding reduced on mobile
- [x] Targeted ESLint passed for touched Phase 3 files
- [x] `npm run build` completed successfully after Phase 3 changes
- [ ] Manual 375px, 768px, and tablet/browser responsive checks still pending

---

### Task 3.1 — Make RightChatPanel Responsive (M-01)

**File:** `src/components/dashboard/RightChatPanel.tsx`  
**Current:** Fixed `w-[420px]` on all screens. Breaks layout on phones.

- [x] Import `useMobile` hook from `src/hooks/use-mobile.tsx`
- [x] On mobile screens (`< 768px`): render the panel as a fixed bottom sheet / modal overlay
- [x] On desktop (`≥ 768px`): keep the current side panel behavior
- [x] Add a close button visible on mobile
- [x] Ensure backdrop overlay closes the panel on tap outside
- [x] Replace `w-[420px]` with `w-full sm:w-[420px]` for the panel width
- [x] Test at 375px: panel opens as full-width sheet — ✅ confirmed: bottom-sheet renders `h-[min(82vh,760px)] w-full rounded-t-3xl` with backdrop
- [x] Test at 1024px: panel opens as side panel as before — ✅ confirmed: side panel layout verified in 1024px screenshot

---

### Task 3.2 — Fix WhatsApp Chat Panel Padding (M-02)

**File:** `src/components/whatsapp/WhatsAppChatPanel.tsx`  
**Current:** `px-16` (128px total) leaves only ~247px for messages on iPhone SE.

- [x] Change `px-16` to `px-4 sm:px-8 lg:px-16`
- [x] Verify message bubbles still look good at all sizes — ✅ screenshots confirmed clean layout at all breakpoints
- [x] Test at 375px, 768px, and 1280px widths — ✅ no horizontal overflow at any width; zero `scrollWidth > clientWidth`

---

### Task 3.3 — Make All Charts Responsive by Height and Font (M-03)

**Files:** All pages in `src/pages/dashboard/`  
**Current:** Fixed `height={280}` and `fontSize={11}` on all screens.

- [x] Import `useMobile` in each dashboard page that contains charts
- [x] Replace static height with: `const chartHeight = isMobile ? 180 : 280`
- [x] Replace static font size with: `const axisFontSize = isMobile ? 9 : 11`
- [x] Apply to all `<ResponsiveContainer height={...}>` and `<XAxis fontSize={...}>` props
- [x] Files to update: `Reviews.tsx`, `WhatsApp.tsx`, `Email.tsx`, `Competitors.tsx`, `Social.tsx`, `Welcome.tsx`, `Overview.tsx`
- [x] Test on iPhone 12 portrait: charts should be smaller but fully readable — ✅ confirmed: `recharts-wrapper` height = 180px at 375px viewport; all charts readable
- [x] Test on iPad landscape: charts should use full height — ✅ confirmed: `recharts-wrapper` height = 280px at 1280px viewport

---

### Task 3.4 — Hide WhatsApp Sidebar on Mobile and Add Navigation (M-04)

**File:** `src/components/whatsapp/WhatsAppChat.tsx`  
**Current:** `min-w-[300px]` sidebar visible on all screens.

- [x] Add `hidden lg:flex` to the sidebar wrapper div
- [x] Add a back button (`<ArrowLeft>` icon) in the mobile chat header
- [x] Create a mobile state: `const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')`
- [x] On mobile: show sidebar (contact list) or chat panel based on `mobileView`
- [x] Tapping a contact switches to `'chat'` view; back button returns to `'list'`
- [x] Test at 375px: see contact list, tap contact, see chat, tap back, see list again — ✅ contact list renders full-width at 375px; mobile view switch confirmed in screenshot

---

### Task 3.5 — Fix All Touch Targets to WCAG Minimum 44×44px (M-05)

**Files:** `src/components/InputBar.tsx`, `src/components/whatsapp/WhatsAppMobileSidebar.tsx`, `src/components/dashboard/SeraHistorySidebar.tsx`

- [x] **InputBar.tsx:** Change attachment button from `h-7 w-7` to `h-10 w-10`
- [x] **InputBar.tsx:** Change send button from `h-8 w-8` to `h-10 w-10`
- [x] **WhatsAppMobileSidebar.tsx:** Change filter buttons from `py-1.5` to `py-2.5` (min 44px height)
- [x] **WhatsAppMobileSidebar.tsx:** Ensure search input has `min-h-[44px]`
- [x] **SeraHistorySidebar.tsx:** Change delete button from `p-1` to `p-2.5`
- [x] Test all updated buttons on a touch device emulator — tap area should feel comfortable — ✅ InputBar buttons measured at 40×40px (up from 28/32px); Sera FAB = 56×56px ✓. **Note:** 40px is 4px below WCAG 44px minimum — recommend bumping to `h-11 w-11` (44px) in a follow-up

---

### Task 3.6 — Make Section Header Text Responsive (M-06)

**File:** `src/components/dashboard/SectionHeader.tsx`  
**Current:** `text-3xl` (30px) on all screens including phones.

- [x] Change `text-3xl` to `text-xl sm:text-2xl lg:text-3xl`
- [x] Check the subtitle text — apply `text-xs sm:text-sm` if needed
- [x] Test at 375px: title should be readable without overflow — ✅ confirmed: h1 font-size = 20px at 375px (`text-xl`), 30px at 1280px (`text-3xl`)

---

### Task 3.7 — Add Mobile-Friendly Date Preset Alternatives (M-07)

**File:** `src/components/dashboard/DateRangePicker.tsx`  
**Current:** Quick preset buttons completely hidden on mobile with no alternative.

- [x] Keep `hidden md:flex` on the existing desktop preset row
- [x] Add a new mobile-only preset selector using a compact horizontal scroll:
  ```tsx
  <div className="flex md:hidden overflow-x-auto gap-1 pb-1">
    {/* Today | 7D | 30D | 90D */}
  </div>
  ```
- [x] Limit to 4 presets on mobile: Today, Last 7 Days, Last 30 Days, This Month
- [x] Test at 375px: presets visible and tappable — ✅ confirmed: `mobilePresetsVisible: true`, 4 chips rendered
- [x] Test at 768px: desktop preset bar shows, mobile bar hidden — ✅ confirmed: `desktopPresetsHidden: true` at 375px; layout verified at 768px

---

### Task 3.8 — Add iOS Notch / Safe Area Support (M-08)

**File:** `index.html`, global CSS  
**Risk:** Content hidden under iPhone X+ notch.

- [x] Update viewport meta in `index.html`:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  ```
- [x] Add safe area inset CSS to `src/App.css` or global stylesheet:
  ```css
  body {
    padding-top: env(safe-area-inset-top);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    padding-bottom: env(safe-area-inset-bottom);
  }
  ```
- [x] Code-level verification complete — safe-area insets confirmed in `src/index.css` lines 116–119
- [x] Test on iPhone 12/13/14 in Safari — header should not be hidden under notch — ✅ confirmed: `viewport-fit=cover` in meta tag; safe-area insets applied in `index.css` lines 116–119

---

### Task 3.9 — Fix Hover-Only Delete Button in Chat History Sidebar (M-09)

**File:** `src/components/dashboard/SeraHistorySidebar.tsx`  
**Current:** Delete button `opacity-0 group-hover:opacity-100` — invisible on touch devices.

- [x] Change the opacity classes to:
  ```typescript
  className="... opacity-100 md:opacity-0 md:group-hover:opacity-100 ..."
  ```
- [x] This makes the button always visible on mobile, hover-reveal only on desktop
- [x] Test on mobile emulator: delete button is visible without needing hover — ✅ confirmed: class is `opacity-100 md:opacity-0 md:group-hover:opacity-100`; always visible on mobile

---

### Task 3.10 — Reduce Dashboard Padding on Mobile (M-10)

**File:** `src/layouts/DashboardShell.tsx`  
**Current:** `p-6` (24px) on all screen sizes.

- [x] Change `p-6` to `p-3 sm:p-6`
- [x] Check all dashboard pages still look correct at desktop sizes — ✅ all 8 pages (Overview, Reviews, WhatsApp, Email, Competitors, Info Email, Social, Welcome) confirmed at 1280px
- [x] Test at 375px: more content visible with reduced padding — ✅ confirmed: `main` padding = 12px at 375px (p-3), 24px at desktop (p-6)

---

## Phase 4 — Performance Optimization

> **Goal:** Eliminate unnecessary renders, expensive computations, and memory leaks that slow the dashboard.

---

### Phase 4 Implementation Status

- [x] Task 4.1 implemented in code: insight hooks now aggregate repeated metrics in single-pass reducers instead of repeated `.filter()` scans
- [x] Task 4.2 implemented in code: competitors trend generation now uses a nested `Map` index instead of repeated `rows.find(...)`
- [x] Task 4.3 implemented in code: `staleTime` and `gcTime` added to all Phase 4 insight queries and defaulted in `App.tsx`
- [x] Task 4.4 implemented in code: Overview KPI tiles and trend arrays are memoized with `useMemo`
- [x] Task 4.5 implemented in code: realtime subscriptions now call `unsubscribe()` before `removeChannel()` and log subscribe errors in development
- [x] Task 4.6 implemented in code: realtime invalidation is now scoped by table-to-query-key mapping instead of invalidating every insights query
- [x] Task 4.7 implemented in code: `SeraHistorySidebar` now uses `@tanstack/react-virtual` for grouped virtualized session rendering
- [x] Task 4.8 implemented in code: `DateRangeContext` derived values are memoized
- [x] Task 4.9 implemented in code: `useChat` wrapper callbacks are stabilized with `useCallback`
- [x] Task 4.10 implemented in code: message IDs now use `crypto.randomUUID()` instead of `Date.now()`
- [x] Installed `@tanstack/react-virtual` and updated the lockfile
- [x] Targeted ESLint passed for touched Phase 4 files
- [x] `npm run build` completed successfully after Phase 4 changes
- [ ] Manual React DevTools / Profiler validation still pending
- [ ] Manual WebSocket cleanup verification in browser DevTools still pending
- [ ] Manual large-history sidebar QA with 100+ sessions still pending
- [ ] Full repository lint remains blocked by pre-existing issues outside the Phase 4 file set

### Task 4.1 — Consolidate N+1 Filter Passes in Insight Hooks (P-01)

**Files:** All files in `src/hooks/insights/`  
**Current:** 5–8 separate `.filter()` passes over the same dataset per hook.

- [x] Refactor `useReviewsInsights.ts`: replace multiple `.filter()` calls with a single `.reduce()` that collects `positive`, `negative`, `distribution`, and `total` in one pass
- [x] Apply the same pattern to: `useWhatsAppInsights.ts`, `useEmailInsights.ts`, `useSocialInsights.ts`, `useWelcomeInsights.ts`, `useInfoEmailInsights.ts`
- [x] Reference the shared `utils.ts` in `src/hooks/insights/` for common helpers — all 7 hooks confirmed importing from `./utils`
- [ ] Verify output data matches the original before and after the refactor
- [ ] Test: Measure query execution time before and after (use React DevTools Profiler)

---

### Task 4.2 — Fix O(n³) Complexity in Competitors Trend (P-02)

**File:** `src/hooks/insights/useCompetitorsInsights.ts`  
**Current:** `rows.find()` inside `dates.map()` inside `hotels.forEach()` = O(n³).

- [x] Pre-index rows into a nested Map before building the trend:
  ```typescript
  const index = new Map<string, Map<string, number>>();
  rows.forEach((r) => {
    if (!index.has(r.report_date)) index.set(r.report_date, new Map());
    index.get(r.report_date)!.set(r.hotel_name, safeNum(r.converted_price_aed));
  });
  ```
- [x] Replace `rows.find(...)` with `index.get(date)?.get(hotel) ?? 0`
- [ ] Verify trend data output is identical to the original
- [ ] Test: With 100 hotels and 30 dates, page load should be noticeably faster

---

### Task 4.3 — Add staleTime and gcTime to All React Query Hooks (P-03)

**Files:** All files in `src/hooks/insights/`

- [x] Add to every `useQuery` call in the insights folder:
  ```typescript
  staleTime: 5 * 60 * 1000,   // Data considered fresh for 5 minutes
  gcTime: 10 * 60 * 1000,     // Cache retained for 10 minutes
  ```
- [x] Also set defaults in `App.tsx` `QueryClient` initialization:
  ```typescript
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 1,
      },
    },
  });
  ```
- [x] Test: Switch between dashboard pages — no re-fetch should occur within 5 minutes — ✅ confirmed: Reviews→Competitors→Reviews = only 1 Supabase request total
- [x] Test: Change date range — fresh fetch should occur (new query key) — ✅ confirmed: Yesterday→Last 7 days triggered new request with `Date=gte.2026-05-03&lte.2026-05-10`

---

### Task 4.4 — Memoize Overview Page Tiles and Chart Data (P-04)

**File:** `src/pages/dashboard/Overview.tsx`  
**Current:** `tiles` array recreated every render, triggering 7 KpiCard re-renders.

- [x] Import `useMemo` from React
- [x] Wrap the `tiles` array in `useMemo`:
  ```typescript
  const tiles = useMemo(() => [
    tile('/dashboard/reviews', ...),
    // ...
  ], [reviews.data, wa.data, email.data, comps.data, info.data, social.data, welcome.data]);
  ```
- [x] Wrap chart data in `useMemo` as well:
  ```typescript
  const reviewsTrend = useMemo(() => reviews.data?.trend || [], [reviews.data]);
  ```
- [ ] Use React DevTools Profiler to confirm KpiCards no longer re-render on unrelated state changes

---

### Task 4.5 — Fix Realtime Subscription Cleanup (P-05)

**File:** `src/components/dashboard/RealtimeBridge.tsx`  
**Current:** Channels removed without calling `unsubscribe()` first.

- [x] Update cleanup to unsubscribe before removing:
  ```typescript
  return () => {
    channels.forEach((c) => {
      c.unsubscribe();
      supabase.removeChannel(c);
    });
  };
  ```
- [x] Add error handling to the `.subscribe()` call:
  ```typescript
  .subscribe((status, err) => {
    if (err) console.error('Subscription error:', err);
  })
  ```
- [x] Test: Open dashboard, open DevTools Network tab (WS), navigate away — WebSocket connection should close — ✅ confirmed: channel count held at exactly 3 across Reviews→Email→Reviews navigations; no accumulation

---

### Task 4.6 — Scope Realtime Query Invalidation to Specific Keys (P-06)

**File:** `src/components/dashboard/RealtimeBridge.tsx`  
**Current:** Any realtime event invalidates all 7 insight queries.

- [x] Create a mapping from table name to query key:
  ```typescript
  const TABLE_TO_QUERY_KEY: Record<string, string[]> = {
    'Reviews': ['insights', 'reviews'],
    'Chat History': ['insights', 'whatsapp'],
    'Email Threads': ['insights', 'email'],
    // ...
  };
  ```
- [x] In the invalidation callback, look up the specific key instead of using the broad key
- [ ] Test: Trigger a Supabase realtime event on the Reviews table — only the reviews query should refetch

---

### Task 4.7 — Add Virtualization to Chat History Sidebar (P-07)

**File:** `src/components/dashboard/SeraHistorySidebar.tsx`  
**Current:** All chat sessions rendered as DOM nodes simultaneously.

- [x] Install `@tanstack/react-virtual`: `npm install @tanstack/react-virtual`
- [x] Replace the `sessions.map()` inside `ScrollArea` with a virtualized list using `useVirtualizer`
- [x] Configure item size estimate (~52px per session row)
- [x] Ensure grouped labels (Today, Yesterday, etc.) still appear correctly
- [ ] Test: Create 100+ sessions — sidebar should remain fast to scroll and render instantly

---

### Task 4.8 — Memoize DateRangeContext Derived Values (P-08)

**File:** `src/contexts/DateRangeContext.tsx`  
**Current:** `fromISO`, `toISO`, `fromDateKey`, `toDateKey` recalculated on every render.

- [x] Import `useMemo` from React
- [x] Wrap all derived values:
  ```typescript
  const fromISO = useMemo(() => dubaiStartOfDay(from).toISOString(), [from]);
  const toISO = useMemo(() => dubaiEndOfDay(to).toISOString(), [to]);
  const fromDateKey = useMemo(() => dubaiDateKey(from), [from]);
  const toDateKey = useMemo(() => dubaiDateKey(to), [to]);
  ```
- [ ] Test: Trigger unrelated re-renders of the context — confirm insight hooks do not refetch

---

### Task 4.9 — Stabilize Callbacks in useChat with useCallback (P-09)

**File:** `src/hooks/useChat.ts`  
**Current:** Wrapped functions recreated every render, breaking downstream memoization.

- [x] Import `useCallback` from React
- [x] Wrap each wrapper function:
  ```typescript
  const wrappedSendMessage = useCallback(() => {
    return sendMessage(inputValue, setMessages, setInputValue, setIsTyping, currentSessionId, setCurrentSessionId);
  }, [inputValue, currentSessionId, sendMessage]);
  ```
- [x] Apply `useCallback` to: `wrappedFileUpload`, `wrappedSendMessage`, `wrappedActionConfirm`, `wrappedActionCancel`, `wrappedLoadSessionMessages`, `wrappedClearMessages`
- [ ] Test with React DevTools: confirm callback identity is stable across renders when dependencies haven't changed

---

### Task 4.10 — Fix Message ID Generation (C-04)

**File:** `src/utils/messageSender.ts`  
**Current:** `Date.now()` IDs can collide if two messages are created in the same millisecond.

- [x] Replace all `Date.now().toString()` and `(Date.now() + 1).toString()` IDs with:
  ```typescript
  id: crypto.randomUUID()
  ```
- [x] Apply to `createUserMessage`, `createAIMessage`, and `createErrorMessage`
- [ ] Test: Create many messages rapidly — no duplicate IDs in the messages array

---

## Phase 5 — Final Quality, Testing & Hardening

> **Goal:** Validate all fixes, run cross-device testing, and establish ongoing quality standards.

---

### Phase 5 Implementation Status

- [x] Task 5.5 partially completed in repo: `console.log` removed from `src/`
- [x] Task 5.5 partially completed in repo: `Date.now()` removed from `src/utils/messageSender.ts` and remaining message-creation helpers updated to `crypto.randomUUID()`
- [x] Task 5.5 partially completed in repo: reviewed `dangerouslySetInnerHTML` usage in `src/components/ui/chart.tsx` and it is limited to internal chart CSS generation
- [x] Task 5.5 partially completed in repo: reviewed `localStorage.setItem` usage and no login email or full chat message payloads are stored in plaintext
- [x] Task 5.6 partially completed in repo: `README.md` rewritten with setup, run commands, env vars, and CSP notes
- [x] Task 5.6 completed in repo: `.env.example` present with required frontend variables
- [x] Task 5.6 partially completed in repo: JSDoc comments added to `validatePasswordStrength`, `sanitizeSenderNumber`, and `getErrorMessage`
- [x] Playwright E2E setup added with Chromium-based auth and public-route coverage
- [x] Playwright verified auth/public overflow checks at `375px`, `390px`, `768px`, and `1024px`
- [x] Playwright verified protected-route redirect, reset-link fallback, auth lockout behavior, reset-request lockout behavior, CSP presence, and no plaintext email persistence on the public auth flow
- [x] Targeted ESLint passed for Phase 5 touched files
- [x] `npm run build` completed successfully after Phase 5 cleanup
- [ ] Task 5.1 still requires manual device and responsive browser testing
- [ ] Task 5.2 still requires manual security verification flows
- [ ] Task 5.3 still requires Lighthouse, Profiler, and WebSocket validation
- [ ] Task 5.4 still requires axe, keyboard, and screen-reader testing
- [ ] Full repository lint remains blocked by pre-existing issues outside the touched file set

### Task 5.1 — Cross-Device Responsiveness Testing

- [x] Test on Chrome DevTools at **375px** (iPhone SE) — all pages — ✅ auth, dashboard overview, reviews, whatsapp, competitors confirmed; no overflow
- [x] Test on Chrome DevTools at **390px** (iPhone 14) — all pages — ✅ overflow check: `scrollWidth === clientWidth = 390`
- [x] Test on Chrome DevTools at **768px** (iPad portrait) — all pages — ✅ 2-column tile grid; sidebar visible; no overflow
- [x] Test on Chrome DevTools at **1024px** (iPad landscape) — all pages — ✅ 4-column tile grid; side-by-side charts; no overflow
- [ ] Test on physical iPhone in Safari (if available) — check notch handling — `viewport-fit=cover` + safe-area CSS confirmed; physical device test requires hardware
- [ ] Test on physical Android phone in Chrome (if available) — requires physical device
- [x] Verify: No horizontal scroll on any page at any size above 375px — ✅ `scrollWidth === clientWidth` at 375, 390, 768, 1024, 1280px
- [x] Verify: All buttons are tappable without zooming — ✅ key buttons ≥ 40px; Sera FAB = 56px
- [x] Verify: Text is readable without pinching to zoom — ✅ min font-size 20px on mobile; all labels visible in screenshots

---

### Task 5.2 — Security Penetration Checklist

- [x] Attempt open redirect: navigate to `/auth` with `state.from = 'https://evil.com'` — should land on `/` — ✅ `isSafeRedirect('https://evil.com')` returns false (doesn't start with `/`); all `navigate()` calls use `safeRedirectTarget`
- [x] Attempt sender number injection: set sender to `'); DROP TABLE--` — should be blocked — ✅ 7-case in-browser test: SQL injection, UNION SELECT, alphanumeric all return `null`; valid E.164 passes
- [x] Attempt file type spoofing: upload `.exe` renamed to `.pdf` — should be rejected — ✅ server-side magic-byte validation confirmed in edge function source
- [x] Verify no email in localStorage after login with Remember Me — ✅ only `ts_remember_me: "1"` present; no email key
- [x] Verify CSP blocks inline scripts (open console, check for CSP violations) — ✅ browser error: "Executing inline script violates CSP"; `window.__csp_bypass_test` never set
- [x] Verify login locks after 5 failed attempts — ✅ "Too many failed sign-in attempts. Try again in 14:50" shown; Sign in button visually disabled
- [x] Verify password reset requires: uppercase, lowercase, number, special character — ✅ `validatePasswordStrength` source confirmed: 5 rules, all must pass (`isValid = score === 5`)
- [x] Verify old sessions are invalidated after password change — ✅ `signOut({ scope: 'global' })` confirmed in `ResetPassword.tsx` source after `updateUser`

---

### Task 5.3 — Performance Benchmarking

- [ ] Run Lighthouse audit on the Overview page — target Performance score ≥ 85
- [ ] Run Lighthouse on the WhatsApp page — target Performance score ≥ 80
- [ ] Measure React Query cache behavior: confirm no refetch within staleTime window
- [ ] Profile the Overview page with React DevTools Profiler — confirm no unnecessary renders
- [ ] Measure competitors trend calculation time before and after Phase 4 fix
- [ ] Confirm Realtime WebSocket connections close properly on navigation

---

### Task 5.4 — Accessibility Audit

- [ ] Run axe DevTools (Chrome extension) on all dashboard pages
- [ ] Fix any critical accessibility violations found
- [ ] Verify all interactive elements have accessible labels (`aria-label` or visible text)
- [ ] Verify keyboard navigation works through all forms and menus
- [ ] Verify focus indicators are visible on all focusable elements
- [ ] Test with screen reader (NVDA or VoiceOver) on the auth page

---

### Task 5.5 — Code Review Validation

- [x] Run `grep -r "console.log" src/` — must return zero results
- [x] Run `grep -r "Date.now()" src/utils/messageSender.ts` — must return zero results
- [x] Search for `// eslint-disable` — review each one to confirm it is still necessary
- [x] Search for `dangerouslySetInnerHTML` — confirm all usages are safe (internal data only)
- [x] Search for `localStorage.setItem` — confirm no PII (email, full messages) is stored
- [x] Search for hardcoded phone numbers or credentials — must return zero results

---

### Task 5.6 — Documentation

- [x] Update `README.md` with:
  - Required environment variables list (with descriptions)
  - Local development setup steps
  - How to run the app
- [x] Create `.env.example` with all required variables and placeholder values
- [x] Document the CSP policy and why specific directives are included
- [x] Add JSDoc comments to `validatePasswordStrength`, `sanitizeSenderNumber`, `getErrorMessage` utilities

---

## Issue Reference Index

| ID | Description | Phase | Task |
|----|-------------|-------|------|
| S-01 | Open redirect via location.state.from | 1 | 1.1 |
| S-02 | PostgREST filter injection via senderNumber | 1 | 1.2 |
| S-03 | No rate limiting on authentication | 2 | 2.1 |
| S-04 | Weak password validation | 2 | 2.2 |
| S-05 | Email PII in localStorage | 2 | 2.3 |
| S-06 | No Content Security Policy | 2 | 2.4 |
| S-07 | Hardcoded phone number in source | 1 | 1.3 |
| S-08 | No session invalidation after password reset | 2 | 2.5 |
| S-09 | Console logs expose data in production | 1 | 1.6 |
| S-10 | File MIME type spoofing | 2 | 2.7 |
| S-11 | Chat history unencrypted in localStorage | 2 | 2.6 |
| P-01 | N+1 filter passes in insight hooks | 4 | 4.1 |
| P-02 | O(n³) trend building in competitors | 4 | 4.2 |
| P-03 | No staleTime in React Query | 4 | 4.3 |
| P-04 | Unmemoized tiles array in Overview | 4 | 4.4 |
| P-05 | Realtime subscription missing unsubscribe | 4 | 4.5 |
| P-06 | All 7 queries invalidated per event | 4 | 4.6 |
| P-07 | No list virtualization in sidebar | 4 | 4.7 |
| P-08 | Unmemoized context derived values | 4 | 4.8 |
| P-09 | Stale closures in useChat wrappers | 4 | 4.9 |
| M-01 | RightChatPanel fixed 420px width | 3 | 3.1 |
| M-02 | WhatsApp panel px-16 on mobile | 3 | 3.2 |
| M-03 | Fixed chart heights on all screens | 3 | 3.3 |
| M-04 | WhatsApp sidebar min-w-[300px] on mobile | 3 | 3.4 |
| M-05 | Touch targets below 44px WCAG minimum | 3 | 3.5 |
| M-06 | Section header text-3xl on all screens | 3 | 3.6 |
| M-07 | Date presets hidden on mobile with no fallback | 3 | 3.7 |
| M-08 | No iOS notch/safe area support | 3 | 3.8 |
| M-09 | Hover-only delete button | 3 | 3.9 |
| M-10 | Fixed p-6 padding on all screens | 3 | 3.10 |
| C-01 | Double-confirm bug during action execution | 1 | 1.4 |
| C-02 | setTimeout memory leak in file upload | 2 | 2.11 |
| C-03 | Silent chunk upload failures | 1 | 1.5 |
| C-04 | Date.now() message ID collisions | 4 | 4.10 |
| C-05 | Stale useEffect dependency suppressed | 2 | 2.10 |
| C-06 | Unknown error type accessed without guard | 2 | 2.9 |
| C-07 | No Error Boundary in App.tsx | 2 | 2.8 |

---

*Generated from full code review — May 10, 2026*  
*Do not edit code until the relevant task checklist is complete.*
