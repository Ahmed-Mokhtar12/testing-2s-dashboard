# Hotel Training — Design Spec

**Date:** 2026-06-10
**Project:** Two Seasons Insights Dashboard
**Feature:** Hotel Training module (Phase 1)

---

## Overview

Port the "Monthly Training" Power Apps canvas app into the dashboard as a new section at `/dashboard/hotel-training`. Both the website and Power Apps will continue to operate in parallel, reading and writing the **same SharePoint lists**. SharePoint is the source of truth. Supabase is used for analytics, dashboard reporting, and sync tracking only.

---

## Decisions Made

| Topic | Decision |
|---|---|
| Route | `/dashboard/hotel-training` inside `DashboardShell` |
| Graph token | Extend `signInWithAzure()` scopes; use `session.provider_token` |
| Wizard navigation | In-page stepper (single route, no sub-routes) |
| Wizard state | Owned by `HotelTraining.tsx`, lifted to `useHotelTrainingForm` hook if it grows |
| Admin panel | Tab on the same page — "Register Training" / "Manage Members" |
| TrainingID format | `TRN-yyyyMMddHHmmss` |
| Dual-write | SharePoint first → Supabase second (best-effort), `sync_queue` on failure |
| Draft clear rule | Clear only after all SharePoint writes succeed (Supabase failure is acceptable) |
| Phase 1 scope | No retry UI for `sync_queue`; table exists for manual inspection |

---

## Out of Scope (Phase 1)

- Training history / past-records viewing pages
- Mobile-specific responsive work beyond the design system's defaults
- Admin retry UI for `training_sync_queue`
- Server-side admin enforcement (Edge Function) — deferred to a later phase
- Any changes to the Power Apps app or SharePoint schema

---

## SharePoint Backend

**Site:** `https://2seasonshotels.sharepoint.com/sites/Two_Seasons_Training_Record`

All reads/writes go through Microsoft Graph API (`/sites/{site-id}/lists/{list-id}/items`) using the signed-in user's delegated token.

### List 1: `Monthly_Training`
**GUID:** `aa8fe143-854d-4646-a423-89bc44bb217d`

| Internal name | Type | Required |
|---|---|---|
| `Title` | Single line text | yes |
| `field_1` | Choice (single) — Department | yes |
| `field_4` | Number — Duration (minutes) | yes |
| `field_5` | Number — Location | no |
| `field_6` | Number — Total Participants | yes (auto-calculated) |
| `field_7` | Number — Remarks | no |
| `field_8` | DateTime — Date | yes |
| `TrainerName_x002e_` | Choice (multi-select) — Trainer Name | yes |

> Department and TrainerName choice options are fetched live from Graph (`/lists/{id}/columns`) to stay in sync with Power Apps.

### List 2: `Monthly_Training_Participants`
**GUID:** `73f67c6d-f327-4c14-aa68-2b718afcd132`

Fields written per row: `TrainingID`, `RowNo`, `EmployeeID`, `ColleagueName`, `Position`, `Section`, `Department`, `Title` (= `ColleagueName`).

### List 3: `Colleagues_Master`
**GUID:** `8bdc10b9-01c8-4310-8a16-48eb83020d7e`

Fields used: `EmployeeID`, `ColleagueName`, `Position`, `Section`, `Department` (`.Value`), `IsActive`, `Title`.

Only `IsActive = true` colleagues are selectable in the participant search. Removal is a soft-delete (`IsActive = false`). Employee ID uniqueness checks include both active and inactive records.

---

## File Structure

```
src/
  pages/dashboard/
    HotelTraining.tsx              ← main page, stepper state, tabs
  services/
    sharepoint.ts                  ← Graph API service (all SP reads/writes)
  hooks/
    useColleagues.ts               ← React Query: fetch + cache Colleagues_Master
    useListColumns.ts              ← React Query: fetch column choices (dept, trainer)
    useTrainingSubmit.ts           ← mutation: SP write → Supabase write
  components/hotel-training/
    TrainingDetailsForm.tsx        ← Step 1 form (RHF + Zod)
    ParticipantsStep.tsx           ← Step 2 — fixed row table
    ParticipantRow.tsx             ← individual row with colleague search combobox
    ConfirmationStep.tsx           ← Step 3 — summary + submit
    AdminPanel.tsx                 ← Manage Members tab
    AddMemberForm.tsx              ← admin: add colleague
    RemoveMemberForm.tsx           ← admin: soft-delete colleague
  App.tsx                          ← add /dashboard/hotel-training route
  components/dashboard/
    AppSidebar.tsx                 ← add Hotel Training nav item
  contexts/
    AuthContext.tsx                ← extend signInWithAzure scopes

index.html                         ← CSP: add graph.microsoft.com + login.microsoftonline.com

supabase/migrations/
  YYYYMMDDHHMMSS_hotel_training.sql
```

---

## Authentication & Token Acquisition

### Scope extension

`signInWithAzure()` in `AuthContext.tsx` is updated to:

```ts
scopes: 'email profile openid offline_access Sites.ReadWrite.All'
```

Existing logged-in users will need to sign in once to receive the new token with the Graph scopes. No other changes to the auth flow.

### Runtime token usage

- Read `session.provider_token` (Microsoft access token stored by Supabase after OAuth)
- On Graph API 401: call `supabase.auth.refreshSession()` silently, retry the request once
- If still 401 after retry: show toast "Session expired — please sign in again"

### CSP update (`index.html`)

Add to `connect-src`:
```
https://graph.microsoft.com https://login.microsoftonline.com
```

---

## Service Layer — `src/services/sharepoint.ts`

Plain async functions, no React, no classes. All Graph API knowledge is contained here.

### Shared utilities

```ts
graphRequest(token, url, options?)
```
Adds `Authorization: Bearer {token}` and `Content-Type: application/json`. Implements the 429 retry loop: reads `Retry-After` header, waits, retries up to 3 times before throwing.

```ts
getSiteId(token)
```
Resolves `https://2seasonshotels.sharepoint.com/sites/Two_Seasons_Training_Record` to a Graph site-id. Memoized in module scope (fetched once per session).

### Exported functions

| Function | Description |
|---|---|
| `getListColumns(token, listId)` | Fetches column definitions, extracts `.choices` for Department and TrainerName |
| `getColleagues(token)` | Pages through Colleagues_Master via `$top=500` + `@odata.nextLink` until exhausted |
| `createTrainingSession(token, data)` | POST to Monthly_Training, returns item ID |
| `createParticipants(token, rows)` | POST one item per row to Monthly_Training_Participants; returns `{ succeeded, failed }` |
| `createColleague(token, data)` | Admin: POST new member with `IsActive: true`, `Title = ColleagueName` |
| `patchColleague(token, itemId, patch)` | Admin: PATCH any field (used for soft-delete: `{ IsActive: false }`) |

### Throttling & pagination

- **429:** Every `graphRequest` call checks the response status. On 429, read `Retry-After` (default 10s if absent), `await delay`, retry. Max 3 retries. Shows progress indicator message from calling hook.
- **Pagination:** `getColleagues()` follows `@odata.nextLink` in a `while` loop, accumulating all pages.

---

## React Query Hooks

### `useColleagues(token)`

- Calls `getColleagues()`
- `staleTime: 5 * 60 * 1000`
- Returns `{ data: Colleague[], isLoading, error }`
- Invalidated after Add Member or Remove Member admin actions

### `useListColumns(token)`

- Calls `getListColumns()` for Monthly_Training list
- `staleTime: 30 * 60 * 1000`
- Returns `{ departments: string[], trainers: string[], isLoading, error }`

### `useTrainingSubmit()`

A `useMutation` that orchestrates the full submit flow (see Dual-Write section).
Returns `{ mutate, isPending, error, failedParticipants }`.

---

## Wizard — Page Structure

### Route

```
/dashboard/hotel-training
```

Lazy-loaded in `App.tsx`, nested inside `DashboardShell` (same as all dashboard pages).

### Tabs (admin-gated)

```
isAdmin  → <Tabs>: [Register Training] [Manage Members]
!isAdmin → stepper directly, no Tabs component
```

`isAdmin` is computed once:
```ts
const ADMIN_EMAILS = [
  'ahmed.mokhtar@2seasonshotels.com',
  'amir.monir@2seasonshotels.com',
  'xarmaigne.narciso@2seasonshotels.com',
];
const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase() ?? '');
```

### Stepper indicator

```
● Step 1: Training Details  ——  ○ Step 2: Participants  ——  ○ Step 3: Confirm & Submit
```

Active step highlighted; completed steps show a checkmark. Clicking a completed step navigates back without data loss.

### Wizard state (owned by `HotelTraining.tsx`)

```ts
const [step, setStep] = useState<1 | 2 | 3>(1);
const [trainingDetails, setTrainingDetails] = useState<TrainingDetailsValues | null>(null);
const [participants, setParticipants] = useState<ParticipantRow[]>([]);
const [draftAvailable, setDraftAvailable] = useState(false);
```

---

## Step 1 — Training Details (`TrainingDetailsForm.tsx`)

React Hook Form + Zod. All fields submitted together when "Next: Add Participants →" is clicked.

### Fields

| Field | UI | Required |
|---|---|---|
| Training Title | text input | yes |
| Department | select (SP column choices) | yes |
| Training Duration | select (17 predefined options) | yes |
| Total Participants | number input (min 1) | yes |
| Location | number input | no |
| Remarks | number input (SP `field_7` is type Number; used as a numeric code, not free text) | no |
| Date | react-day-picker date picker | yes |
| Time | two selects: hour (00–23) + minute (00–55, 5-min increments) | yes |
| Trainer Name | multi-select combobox (Popover + Command) | yes |

### Duration options

30 min → 30, 45 min → 45, 1 hr → 60, 1.5 hrs → 90, 2 hrs → 120, 2.5 hrs → 150, 3 hrs → 180, 3.5 hrs → 210, 4 hrs → 240, 4.5 hrs → 270, 5 hrs → 300, 5.5 hrs → 330, 6 hrs → 360, 6.5 hrs → 390, 7 hrs → 420, 7.5 hrs → 450, 8 hrs → 480.

### Zod validation

```ts
z.object({
  title: z.string().min(1),
  department: z.string().min(1),  // must be one of fetched choices
  durationMinutes: z.number().refine(v => DURATION_OPTIONS.includes(v)),
  totalParticipants: z.number().int().min(1),
  location: z.string().optional(),
  remarks: z.string().optional(),
  date: z.date(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(55).refine(v => v % 5 === 0),  // 5-min increments
  trainerNames: z.array(z.string()).min(1),
})
```

Date in the past → warning toast only, does not block submission.

### Advancing to Step 2

On valid submit:
1. Save values to `trainingDetails` state
2. Initialise `participants` array to `totalParticipants` empty rows
3. Set `step = 2`

### Changing Total Participants after visiting Step 2

If user navigates back to Step 1 and changes the number:
- **Increase** → append empty rows to existing `participants` array
- **Decrease** → trim from the end; if any row being trimmed is filled, show confirmation dialog: "Reducing participant count will remove filled entries. Continue?"

---

## Step 2 — Participants (`ParticipantsStep.tsx`)

Renders exactly `totalParticipants` `ParticipantRow` components. No add/remove buttons — the count is fixed by Step 1.

### `ParticipantRow.tsx`

Each row contains:
- **RowNo** — read-only label (1, 2, 3…)
- **Colleague search combobox** — type Employee ID or Name; client-side filter of cached active colleagues, excluding already-selected colleagues from other rows
- **Position, Section, Department** — auto-filled read-only labels on selection
- **Clear (×) button** — deselects and resets the row

### Advancing to Step 3

"Next: Review →" runs these checks client-side before allowing advance:
1. All `totalParticipants` rows have a colleague selected
2. No two rows share the same `employeeId`

On failure, show inline error above the participant table: "Please select all participants before submitting." / "Duplicate participants are not allowed."

---

## Step 3 — Confirm & Submit (`ConfirmationStep.tsx`)

Read-only summary:
- All training details in a card
- Table: RowNo | Name | Employee ID | Position | Section | Department
- Buttons: "← Back to edit" and "Confirm & Submit"

On submit: calls `useTrainingSubmit().mutate({ trainingDetails, participants })`.

---

## Success States

After submit, the stepper is replaced by a success screen.

**Full success:**
```
✓ Training submitted successfully.
[Register New Training]   [← Back to Dashboard]
```

**Partial (Supabase sync pending):**
```
⚠ Training saved to SharePoint. Dashboard sync pending.
[Register New Training]   [← Back to Dashboard]
```

Both states clear the localStorage draft (SharePoint record is safe in both cases).

---

## TrainingID Generation

Generated at the start of Step 3 submission:
```ts
const now = new Date();
const pad = (n: number, d = 2) => String(n).padStart(d, '0');
const trainingId = `TRN-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
```

Example: `TRN-20260610144530`

---

## Dual-Write Flow (`useTrainingSubmit`)

```
Step 1: POST → Monthly_Training (SP)
  └─ failure → abort, toast error, keep draft

Step 2: POST all participant rows → Monthly_Training_Participants (SP)
  └─ any failure → surface failedParticipants, show retry UI, keep draft
  └─ all succeed → continue

Step 3 (only after both SP writes fully succeed):
  INSERT → supabase: training_sessions + training_participants
  ├─ success → clear draft, show full success screen
  └─ failure → INSERT into training_sync_queue (payload + error)
               update training_sessions.sync_status = 'partial'/'failed' if row exists
               clear draft (SP record is safe)
               show "Training saved to SharePoint. Dashboard sync pending."
```

**`field_6` (Total Participants)** is written to SharePoint as the count of completed rows — same value as `trainingDetails.totalParticipants`.

---

## Admin Panel (`AdminPanel.tsx`)

### Access gating (two layers)

**Layer 1 — UI:** "Manage Members" tab only renders when `isAdmin === true`.

**Layer 2 — Logic:** All write functions in `AdminPanel`, `AddMemberForm`, and `RemoveMemberForm` re-check `isAdmin` before calling any service function. Non-admin reaches this code path → early return with error toast.

> Phase 1 limitation: this is client-side only. Server-side enforcement (Edge Function) is deferred.

### Add New Member (`AddMemberForm.tsx`)

React Hook Form + Zod:

| Field | Validation |
|---|---|
| Employee ID | required, `/^\d+$/`, must not exist in cached colleagues (active OR inactive) |
| Name | required, `/^[A-Za-z ]+$/` |
| Position | required, `/^[A-Za-z ]+$/` |
| Department | required, from mapping |
| Section | required, filtered by Department |

On submit:
1. Check Employee ID uniqueness in `useColleagues()` cache (active + inactive)
2. If duplicate: inline field error, no network call
3. Call `createColleague(token, { EmployeeID, ColleagueName, Position, Section, Department, IsActive: true, Title: ColleagueName })`
4. Invalidate `useColleagues()` query
5. Reset form
6. Success toast: "New member added successfully."

### Remove Member (`RemoveMemberForm.tsx`)

- Search combobox: active colleagues only (by ID or name)
- On selection: display Name, Employee ID, Position, Department, Section (read-only)
- "Remove" button → confirmation dialog: "This will deactivate [Name]. Are you sure?"
- On confirm: `patchColleague(token, itemId, { IsActive: false })`
- Invalidate `useColleagues()` query
- Success toast: "Member removed successfully. The member is now inactive."
- Soft-delete only — `IsActive: false`, never hard-delete

### Department → Section mapping

```
Engineering: [Engineering]
Executive Office: [Executive Office]
Finance: [Finance]
Food & Beverage: [La Terrasse, House Of Noodles, Pool Bar, Room Service / Minibar, Banquet, F & B Admin, Stewarding, Le Grand Café]
Front Office: [Concierge, Front Office Admin, Guest Relations, Reception Long Term, Telecommunication, Reception Hotel]
Housekeeping: [Housekeeping, Laundry]
Human Resources: [Human Resources, Colleague Cafeteria]
Information Technology: [Information Technology]
Kitchen: [Kitchen Admin, Kitchen Hot, House Of Noodles - Kitchen, Kitchen Pastry, Kitchen Cold, Kitchen Butchery, Kitchen Sushi, Kitchen Bakery]
Materials: [Materials]
Recreation: [Recreation]
Revenue: [Revenue, Reservation]
Sales & Marketing: [Sales & Marketing]
Security: [Security]
```

---

## Draft Autosave

- **Key:** `hotel-training-draft-{userEmail}` (lowercase email)
- **Payload:** `{ trainingDetails, participants, step, savedAt: ISO string }`
- **Write:** on every state change, debounced 800ms
- **On page mount:** if draft key exists for current user, show restore banner:
  ```
  You have an unsaved draft from [formatted date]. [Restore] [Discard]
  ```
  Restore → load state, return to Step 1 (not mid-flow)
- **Clear rule:**
  - SP session POST fails → keep draft
  - Any SP participant row fails → keep draft
  - All SP writes succeed (even if Supabase fails) → clear draft

---

## Supabase Schema

Migration file: `supabase/migrations/YYYYMMDDHHMMSS_hotel_training.sql`

```sql
-- Training sessions
create table public.training_sessions (
  id                 uuid        primary key default gen_random_uuid(),
  sharepoint_id      text        not null,
  training_id        text        not null unique,
  title              text        not null,
  department         text        not null,
  duration_minutes   integer     not null,
  location           text,
  remarks            text,
  training_date      timestamptz not null,
  trainer_names      text[]      not null,
  total_participants integer     not null,
  submitted_by       text        not null,
  submitted_at       timestamptz not null default now(),
  sync_status        text        not null default 'synced'
    check (sync_status in ('synced', 'partial', 'failed'))
);

-- Participants
create table public.training_participants (
  id             uuid    primary key default gen_random_uuid(),
  training_id    text    not null references public.training_sessions(training_id),
  row_no         integer not null,
  employee_id    text    not null,
  colleague_name text    not null,
  position       text    not null,
  section        text    not null,
  department     text    not null,
  unique (training_id, row_no),
  unique (training_id, employee_id)
);

-- Sync retry queue
create table public.training_sync_queue (
  id             uuid        primary key default gen_random_uuid(),
  training_id    text        not null,
  payload        jsonb       not null,
  failure_reason text,
  created_at     timestamptz not null default now(),
  resolved       boolean     not null default false
);

-- RLS
alter table public.training_sessions      enable row level security;
alter table public.training_participants   enable row level security;
alter table public.training_sync_queue    enable row level security;

-- training_sessions: authenticated users can insert their own; admins read all
create policy "users can insert training sessions"
  on public.training_sessions for insert
  to authenticated
  with check (submitted_by = auth.jwt()->>'email');

create policy "admins can read all training sessions"
  on public.training_sessions for select
  to authenticated
  using (
    lower(auth.jwt()->>'email') in (
      'ahmed.mokhtar@2seasonshotels.com',
      'amir.monir@2seasonshotels.com',
      'xarmaigne.narciso@2seasonshotels.com'
    )
  );

-- training_participants: insert allowed for authenticated users; admins read all
create policy "users can insert participants"
  on public.training_participants for insert
  to authenticated
  with check (true);

create policy "admins can read all participants"
  on public.training_participants for select
  to authenticated
  using (
    lower(auth.jwt()->>'email') in (
      'ahmed.mokhtar@2seasonshotels.com',
      'amir.monir@2seasonshotels.com',
      'xarmaigne.narciso@2seasonshotels.com'
    )
  );

-- training_sync_queue: insert for authenticated; select for admins only
create policy "users can insert sync queue entries"
  on public.training_sync_queue for insert
  to authenticated
  with check (true);

create policy "admins can read sync queue"
  on public.training_sync_queue for select
  to authenticated
  using (
    lower(auth.jwt()->>'email') in (
      'ahmed.mokhtar@2seasonshotels.com',
      'amir.monir@2seasonshotels.com',
      'xarmaigne.narciso@2seasonshotels.com'
    )
  );
```

---

## Error Handling Summary

| Scenario | Behaviour |
|---|---|
| SP session POST fails | Abort, error toast, keep draft |
| SP participant row(s) fail | Inline retry UI per failed row, keep draft, no full success shown |
| Graph 401 | Silent `supabase.auth.refreshSession()` + retry once; if still 401 → "Session expired — please sign in again" |
| Graph 429 | Read `Retry-After`, wait, retry ≤3×; show "SharePoint is busy, retrying…" |
| Network offline | Toast: "No connection. Your draft is saved." |
| Supabase write fails after SP success | Insert to `training_sync_queue`, clear draft, advance to partial-success screen |
| Employee ID already exists (Add Member) | Inline field error, no network call |

---

## Playwright E2E Tests

File: `tests/hotel-training.spec.ts`

Coverage:
1. **Happy path** — mock Graph API, submit a training with 3 participants, assert success screen and localStorage draft cleared
2. **Duplicate participant** — select the same colleague twice, assert error message and Step 3 is blocked
3. **Admin panel visibility** — assert "Manage Members" tab is absent for non-admin email, present for admin email
4. **Draft restore** — fill Step 1, hard-refresh, assert restore banner appears and restores form values

---

## Appendix: Colleague Type

```ts
interface Colleague {
  id: string;           // SP item ID
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
  isActive: boolean;
}
```
