

## Add "Change password" to user menu

Add a third item to the user dropdown (between email label and Sign out) that opens a modal letting the signed-in user set a new password.

### UX
- Click avatar/email → dropdown shows: email · **Change password** · Sign out
- "Change password" opens a centered Dialog with three fields:
  - New password (min 8 chars)
  - Confirm new password
  - Submit button "Update password"
- On success: toast "Password updated" + close dialog
- On error: toast with Supabase error message

### Technical changes

**1. `src/components/UserMenu.tsx`** — extend existing dropdown
- Add `KeyRound` icon import from lucide-react
- Add local state: `dialogOpen`, `newPassword`, `confirmPassword`, `submitting`
- Insert new `<DropdownMenuItem>` "Change password" before the Sign out item, which sets `dialogOpen = true`
- Render a `<Dialog>` (shadcn) controlled by `dialogOpen` containing the form
- On submit:
  - Validate length ≥ 8 and match
  - Call `updatePassword(newPassword)` from `useAuth()` (already exposed in `AuthContext`)
  - On success: toast, reset fields, close dialog
- Reuse existing shadcn primitives: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `Input`, `Label`, `Button`

**2. No other files need changes**
- `useAuth().updatePassword` already exists and wraps `supabase.auth.updateUser({ password })`
- No new routes, no migrations, no backend work
- Works for the currently authenticated session (different from the existing `/reset-password` page which handles recovery links)

### Out of scope
- No "current password" re-verification (Supabase doesn't require it for an active session; can add later if you want extra security via re-authentication)
- No changes to the existing `/reset-password` recovery flow

