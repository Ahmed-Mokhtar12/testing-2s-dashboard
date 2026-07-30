# Monthly Training Summary + Pre-Deadline Reminder Emails — Design Spec

**Date:** 2026-07-30
**Project:** Two Seasons Insights Dashboard
**Feature:** Two automated per-department training report emails (monthly summary + month-end reminder), scheduled via pg_cron, sent via Microsoft Graph from an edge function

---

## Overview

Two automated emails to **amir.monir@**, **xarmaigne.narciso@** and
**ahmed.mokhtar@2seasonshotels.com**:

- **A. Monthly summary** — on the 1st of each month, the previous month's training as a
  table with one row per department: distinct trainers, distinct colleagues attended,
  total training man-hours.
- **B. Pre-deadline reminder** — one week before month-end, the same table for the current
  month-to-date, plus each department's standing against its monthly target.

Architecture in one sentence: an **hourly pg_cron job** calls a new edge function
**`training-report`**, which owns all date logic (Asia/Dubai), computes the table from the
Supabase mirror tables, renders HTML in the daily-reviews visual family, sends via Graph
from `sera@2seasonshotels.com`, and records every attempt in **`report_runs`** — retrying
until sent, so a report can be late but is very unlikely to go silently absent (see the
residual-limitation honesty note under Due-report logic below: absence is still possible
if every attempt fails for the report's entire due window).

---

## Decisions Made

| Topic | Decision |
|---|---|
| Hours metric | **Man-hours**: Σ(session duration × attendee count). A 2h session with 10 attendees = 20 hours. Targets are man-hour targets. (User-approved.) |
| Attribution | **Session's department** (`training_sessions.department`) gets full credit for the session's trainers, attendees, and man-hours — one consistent grouping. (User-approved.) |
| Delivery | **Graph `sendMail` from the edge app**: user grants application **Mail.Send** + `ApplicationAccessPolicy` restricted to the `sera@` mailbox, same IT-request flow as the July Sites.Selected grant. (User-approved over n8n-webhook relay and all-n8n.) |
| Scheduler | **pg_cron hourly heartbeat** + claim-guarded send (atomic `report_runs` claim, at-least-once) retried through the due window (see Due-report logic). n8n rejected for the silent-death failure mode; single-shot cron rejected because one bad hour = skipped month. |
| Targets | **Amended 2026-07-30 (user):** no target numbers exist — leave them empty. `training_targets` is still created and seeded with the 14 `DEPARTMENT_SECTIONS` departments (it doubles as the department universe for zero rows), all `monthly_target_hours` NULL. While **no** department has a target, the reminder email omits the Target/Gap/Status columns entirely and shows only the actually conducted trainings; the moment any target value is set, those columns appear with "—" + muted "No target" pill for unset departments. No code change needed to activate. |
| "One week before month-end" | **last day − 7**, computed in Dubai time: 31-day → 24th, 30-day → 23rd, Feb → 21st (leap → 22nd). Exactly 7 full days remain after send day. |
| Zero-training departments | **Shown as zero rows** (visible by design). Row universe = targets table ∪ departments active in the period; sorted by man-hours descending, zeros bottom. |
| Send time | 08:00 Asia/Dubai earliest, matching existing report emails. Dubai has no DST; the fixed `+04:00` convention from `training-aggregator.ts` is reused. |
| Recipients | Code constant in the function (the three addresses above). |

---

## Schema (migrations + rollbacks per house convention)

**`training_targets`**

| Column | Type | Notes |
|---|---|---|
| `department` | `text` PK | Seeded from `DEPARTMENT_SECTIONS` (14 rows) |
| `monthly_target_hours` | `numeric` NULL | Man-hours; NULL = no target set |
| `updated_at` | `timestamptz` default `now()` | |
| `updated_by` | `text` NULL | |

RLS: SELECT for `is_hotel_staff(auth.uid())`; INSERT/UPDATE/DELETE for
`has_role(auth.uid(), 'admin')`. Edited via Supabase dashboard/SQL for now (no UI — YAGNI).

**`report_runs`**

| Column | Type | Notes |
|---|---|---|
| `report_type` | `text` | `'monthly_summary'` \| `'reminder'` — PK part |
| `period` | `text` | `YYYY-MM` the report covers — PK part |
| `status` | `text` | `'sent'` \| `'failed'` |
| `attempts` | `integer` | |
| `last_error` | `text` NULL | |
| `sent_at` | `timestamptz` NULL | |
| `recipients` | `text[]` NULL | |

RLS: SELECT for admins; no client writes (service-role only). This table is the permanent,
inspectable record that a month was sent, retried, or failed — the "fail loudly" ledger.

---

## Edge Function `training-report`

Follows sp-* conventions: `corsHeaders`/`json` from `_shared/http.ts`, Graph token via
`_shared/graph.ts` `getAppToken()`, paged reads via `fetchAllWithCap` (source-lint guard
applies), `verify_jwt = true`, deployed with a self-verifying script modeled on
`scripts/deploy-chat-with-data.sh`.

**Modes:**

- `POST { mode: 'test', report: 'monthly'|'reminder', period?: 'YYYY-MM' }` — caller must
  be an authenticated admin (`getCallerUser` + `has_role` check via caller-JWT client).
  Renders with real data and sends **only to the caller** with subject prefix `[TEST]`.
  Writes nothing to `report_runs`. This is the manual pre-go-live validation path
  (documented curl in the plan).
- `POST { mode: 'cron' }` — any valid JWT at the gateway (anon key suffices; see the
  amended Go-Live section for why that is safe). Runs the due-report logic below.

**Due-report logic (all in Asia/Dubai, pure TS module `report-schedule.ts`, unit-tested):**

- Monthly summary for month M−1: due from the 1st of M at 08:00, and remains due for the
  rest of month M (i.e. until month M itself ends) — not a short 7-day grace window.
  `report_runs` makes a duplicate send impossible and a late report strictly dominates a
  missing one, so there is no reason to stop retrying before the period that defines "M−1"
  itself changes.
- Reminder for month M: due from `lastDay(M) − 7` at 08:00, and remains due through the
  last day of month M (never later — a reminder is meaningless once its month has closed).
- **Epoch floor:** no report is EVER due for a period before `EARLIEST_PERIOD = '2026-08'`
  (a plain lexicographic `period < EARLIEST_PERIOD` check on the computed `YYYY-MM`,
  applied to both branches above). This exists because widening the windows to "due for the
  whole remaining month" (above) would otherwise make every pre-launch month retroactively
  due the instant the scheduler starts running — the epoch floor is what stops that from
  becoming a real backfill. Concretely, without it, `report_runs` being empty (true today)
  plus a widened window would make the June 2026 summary — an all-zero table, since the
  only training sessions on record are 28–29 July — and the July 2026 reminder both fire as
  real, unapproved emails on the very first live `mode:'cron'` invocation. **The epoch floor
  does not apply to `mode:'test'`**, whose entire purpose is previewing arbitrary historical
  periods (including July 2026 and earlier) on demand; it only constrains `dueReports()`,
  the function `mode:'cron'` calls. Practical consequence: the first-ever automated emails
  will be the **August reminder (24 Aug 2026)** and the **1 Sept 2026 summary of August**;
  July 2026 and earlier are reviewable only via `mode:'test'`, never sent automatically.
- For each due report: atomically claim the `report_runs` row (see Idempotency below),
  compute → render → send via Graph `POST /users/sera@2seasonshotels.com/sendMail`, then
  update the row (attempts++, status, `last_error` on failure). Sent later than the
  nominal day → the email carries a visible **"Delayed — originally due {date}"** banner.
- Outside a window, already sent, or already claimed by a concurrent invocation → fast
  no-op (the last case counts separately as `skipped` in the cron response).

**Idempotency, stated precisely:** `mode:'cron'` claim-guards each `(report_type, period)`
before sending — an atomic conditional UPDATE on `report_runs` (status/updated_at as an
optimistic-concurrency token) so two overlapping invocations (`mode:'cron'` accepts the
public anon key, so overlap is deliberately reachable, not just a pg_cron-timing edge case)
cannot both send the same report. This is **at-least-once, not exactly-once**: if the Graph
`sendMail` call succeeds but its response is lost (network blip, function timeout) before
the ledger write commits, the send already happened, the ledger will still read as
unsent/failed, and the next hourly tick will retry — sending a second, genuine duplicate
email. `report_runs`' unique key prevents duplicate **rows**, not duplicate **sends**.

**Failure modes, stated honestly:** a failed send retries every hour for the rest of its due
window (the whole remaining month, per the widened windows above — potentially hundreds of
attempts), each logged. Residual silent risk, precisely stated: if **every** attempt fails
for a report's **entire** due window — the whole of month M for that month's summary, or
from `lastDay(M)-7` through month-end for that month's reminder — the window closes when the
calendar rolls past it (the next `dueReports()` call is computing a *different* period) and
the report is never attempted again. The only surviving trace is a permanent `failed` row in
`report_runs` with `last_error` — nothing currently alerts on it, so an all-window outage is
still a real (if now much narrower) way for a month to end up silently unsent in practice,
even though it is never silently unsent in principle (a queryable trace always exists).

**Aggregation (pure TS module `report-aggregator.ts`, unit-tested):** sessions where
`training_date ∈ [monthStart+04:00, nextMonthStart+04:00)` via `fetchAllWithCap`;
participants fetched by `training_id`. Per session-department: trainers = distinct
`trainer_names` (trimmed, case-insensitive), colleagues = distinct participant
`employee_id`, man-hours = Σ(`duration_minutes`/60 × participant-row count), 1 decimal.
**Data-quality footnote:** any period session with `sync_status ≠ 'synced'` or
`total_participants` ≠ participant-row count adds a footnote ("N sessions have incomplete
mirror data; SharePoint is the source of truth") instead of silently undercounting.

---

## Email HTML (pure TS module `report-html.ts`)

Same visual family as the daily reviews email ("Guest Sentiment Console"): body
`#07111f`, 680px card `#0b1628` with `#22334a` border, sky-blue eyebrow (`#7dd3fc`,
uppercase, 11px) — here **"Hotel Training Console"** — fully table-based with inline CSS,
Arial, and the same footer line.

- **Summary email:** KPI tiles (total man-hours / colleagues trained / active trainers) +
  the department table: Department | Trainers | Colleagues | Man-hours.
- **Reminder email:** same table headed by "X days left in {month}". While no department
  has a target set (current state per the 2026-07-30 amendment), the table shows only the
  conducted-trainings columns. Once any target exists: adds Target | Gap | Status pill per
  row — green ≥100% of target, amber ≥50%, red <50%, gray "No target" (thresholds are
  constants, trivially adjustable). Zero rows show 0s in both variants.

---

## Azure Prerequisite (verify empirically)

**Amended 2026-07-30 (user):** the user believes the Azure email setup may already exist.
The repo only proves the edge app is *used* for SharePoint (`Sites.Selected`); its actual
granted permissions are not visible from code. Verification is therefore empirical: the
deployed function's first test-send attempt is the probe — Graph `202` means Mail.Send is
granted and working; `403 ErrorAccessDenied` means it is not, in which case deliver
`docs/it-requests/2026-07-30-mail-send-grant.md` (same format as the Sites.Selected
request): application **Mail.Send** on the existing edge app (`AZURE_CLIENT_ID`), admin
consent, plus `New-ApplicationAccessPolicy` restricting the app to `sera@2seasonshotels.com`.
Implementation is not blocked either way; **go-live is blocked only on a successful
user-approved test-send**.

---

## Go-Live Sequence & Rollback

1. Migrations (targets + report_runs) with rollback twins → 2. function deployed →
3. user performs Azure grant → 4. user triggers test-sends for both reports, real data →
5. **only after user approval**, the cron migration (`cron.schedule('training-report-hourly',
'0 * * * *', net.http_post …)`, precedent: the LIVE `whatsapp-auto-release-every-minute`
cron.job row) goes live. **Amended at planning:** the cron call authenticates with the
public anon key (the exact pattern of the live `whatsapp-auto-release` job — note this is
the live job's own hardcoded-anon-key literal, not the pattern in its *committed migration
file*, which instead reads a `service_role_key` GUC that is not configured on this
project) instead of a Vault-stored service-role key. This is safe by design, not by
secrecy: `mode:'cron'` is **claim-guarded** — an atomic conditional update on `report_runs`
stops two overlapping invocations from both sending — sends only to the fixed recipients,
only within due windows, and returns counts only — an attacker holding the anon key (a
public value) can at most trigger a due report a few minutes early. Precisely: the claim
guard prevents duplicate **sends** from overlapping invocations; it is **at-least-once**,
not exactly-once, because a Graph response lost after a successful send still causes a
genuine retry-driven duplicate (see Idempotency above). The function's own DB writes use
the auto-injected `SUPABASE_SERVICE_ROLE_KEY`. This also removes the one manual
key-handling step the Vault approach would have required.

Rollback: `cron.unschedule` (rollback file), drop tables (rollback files), delete the
function; revoking Mail.Send in Azure kills sending instantly. Sent emails are unaffected.

## Out of Scope / Non-Goals

- No targets-editing UI (dashboard/SQL editing suffices for 14 rows).
- No SharePoint reads — the Supabase mirror is the reporting source (same decision as the
  Sera training query tool), with the data-quality footnote as the honesty valve.
- No changes to existing n8n workflows or the daily reviews email.
- No alerting side-channel beyond `report_runs` + delayed-send banners (any extra channel
  would share the same failure domains it is meant to watch).
