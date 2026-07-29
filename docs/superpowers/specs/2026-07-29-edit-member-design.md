# Edit Member — Design Spec

**Date:** 2026-07-29
**Project:** Two Seasons Insights Dashboard
**Feature:** Edit Member tab (with Reactivate) in the Hotel Training admin panel

---

## Overview

Add a third tab — **Edit Member** — to the admin panel at `/dashboard/hotel-training`, beside "Add New Member" and "Remove Member". It handles promotions (Position change), department transfers (Department + Section change), name spelling fixes, and reactivation of previously removed members.

Members remain stored in the SharePoint list `Colleagues_Master`; the edit is a single Graph `PATCH` performed server-side by the existing `sp-manage-colleague` Edge Function using app-only credentials. No Postgres schema changes.

---

## Decisions Made

| Topic | Decision |
|---|---|
| Editable fields | Name, Position, Department, Section. **EmployeeID is locked** (identity key). |
| Section on transfer | Changing Department clears Section; only sections of the new department are offered (same cascade as Add Member). |
| Reactivate | Included. Picker lists inactive members with a badge; an inactive member's form shows a "Reactivate this member" switch. |
| Atomicity | Edit + reactivate ride in **one** Graph PATCH (`IsActive: true` merged into the same fields payload). |
| Deactivation via update | **Not allowed.** `update` can only set `IsActive` to `true`; deactivation stays the Remove tab's job. |
| Historical records | Untouched by design — training records store snapshots of participant fields at submission time; an edit affects future submissions only. |
| Add-form duplicate check | Unchanged. A removed member is *reactivated*, not re-added. |
| Save gating | Save enabled only when at least one field differs from current values (or the reactivate switch is on). |
| Confirmation | AlertDialog listing each change as `Field: old → new` (plus "Will be reactivated" when applicable) before the PATCH is sent. |

---

## Out of Scope

- Editing EmployeeID (would break duplicate detection and history linkage).
- Retroactive updates to `Monthly_Training_Participants` / `training_participants` snapshots.
- Changes to trainers, submissions, reports, or the RBAC `user_roles` system.
- Refreshing stale `Colleague` objects embedded in localStorage drafts (next selection uses fresh data).

---

## Server — `sp-manage-colleague` Edge Function

Extend the request union with a third action:

```ts
type Body =
  | { action: 'add'; colleague: NewColleague }
  | { action: 'deactivate'; itemId: string }
  | { action: 'update'; itemId: string; patch: ColleaguePatch };

interface ColleaguePatch {
  colleagueName: string;
  position: string;
  section: string;
  department: string;
  reactivate?: boolean; // true → include IsActive: true in the PATCH
}
```

Behavior:

- Same admin allowlist gate and auth flow as `add`/`deactivate` (no changes).
- Validation: `itemId` numeric; all four patch fields non-blank (mirrors `add`).
- Graph call: `PATCH /sites/{siteId}/lists/{colleagues}/items/{itemId}/fields` with
  `{ Title, ColleagueName, Position, Section, Department }` (Title kept in sync with the
  name, as `add` does), plus `IsActive: true` **only** when `reactivate` is set.
- `IsActive: false` can never be produced by this action.
- Response: `{ ok: true }`.
- Backward compatible: existing `add`/`deactivate` callers are unaffected.

---

## Client transport — `src/services/sharepoint.ts`

Add the third arm to `ManageColleagueRequest` (same shape as the server `Body`), exporting a `ColleaguePatchPayload` interface. `invokeManageColleague` itself is unchanged.

---

## UI — `EditMemberForm` component

New file `src/components/hotel-training/EditMemberForm.tsx`, registered as a third tab in `AdminPanel.tsx` (`Edit Member`, value `edit`). Admin gating identical to the other two forms (tab already only renders for admins; the form re-checks `ADMIN_EMAILS` before submitting).

**Picker.** Same Popover + Command combobox as `RemoveMemberForm`, but filtered to **all** members (active and inactive), searchable by name or EmployeeID. Inactive members show an "Inactive" badge in the list.

**Form.** On selection, a react-hook-form + zod form is pre-filled with current values:

- `name`, `position` — text inputs, same regex validation as Add Member (`/^[A-Za-z ]+$/`).
- `department` — Select over `Object.keys(DEPARTMENT_SECTIONS)`; on change, `section` resets to `''`.
- `section` — Select over `DEPARTMENT_SECTIONS[department]`.
- EmployeeID — rendered as a disabled input (visible, not editable, not part of the form schema).
- If the selected member is inactive: an informational notice plus a **"Reactivate this member"** Switch (default off).

Note: a member's current department/section may not exist in `DEPARTMENT_SECTIONS`
(legacy data). The Selects simply show the pre-filled value as-is; any *change* must pick
from the known lists.

**Save.** Disabled until dirty (any field differs from the selected member's current values, or reactivate is on). Clicking Save opens an AlertDialog listing the changes (`Position: Waiter → Head Waiter`, …). Confirming calls:

```ts
invokeManageColleague({ action: 'update', itemId: selected.id, patch: { ...fields, reactivate } })
```

then invalidates the `['colleagues']` query, clears the selection, and shows a success toast. Errors surface via `toast.error` with the message extracted by `extractInvokeError` (same as Add/Remove).

---

## Error handling

- Server returns 400 for bad `itemId`/blank fields, 401/403 from the shared gates, 500 with the Graph error message otherwise — all unwrapped client-side by the existing `extractInvokeError`.
- Failed PATCH leaves the form populated so the admin can retry.

---

## Testing

- `tests/helpers/hotel-training-mocks.ts`: extend `mockManageColleagueFunction` to answer `update` with `{ ok: true }` and expose the request body to assertions (`onBody` option, mirroring `mockSubmitFunction`).
- `tests/hotel-training.spec.ts` additions:
  1. Edit tab hidden for non-admin, visible for admin (extends the existing gating test).
  2. Happy-path edit: select an active member, change Position, confirm dialog shows `old → new`, assert the outgoing body is `{ action: 'update', itemId, patch }` without `reactivate`.
  3. Transfer: changing Department clears Section and offers only the new department's sections.
  4. Reactivate: select the inactive mock member (`col-4`), toggle the switch, assert `patch.reactivate === true`.
  5. Save stays disabled when nothing changed.
