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
until sent, so a report can be late but never silently absent.

---

## Decisions Made

| Topic | Decision |
|---|---|
| Hours metric | **Man-hours**: Σ(session duration × attendee count). A 2h session with 10 attendees = 20 hours. Targets are man-hour targets. (User-approved.) |
| Attribution | **Session's department** (`training_sessions.department`) gets full credit for the session's trainers, attendees, and man-hours — one consistent grouping. (User-approved.) |
| Delivery | **Graph `sendMail` from the edge app**: user grants application **Mail.Send** + `ApplicationAccessPolicy` restricted to the `sera@` mailbox, same IT-request flow as the July Sites.Selected grant. (User-approved over n8n-webhook relay and all-n8n.) |
| Scheduler | **pg_cron hourly heartbeat** + idempotent send with grace-window retries (see Scheduling). n8n rejected for the silent-death failure mode; single-shot cron rejected because one bad hour = skipped month. |
| Targets | New `training_targets` table, seeded with the 14 `DEPARTMENT_SECTIONS` departments, `monthly_target_hours` NULL until the user supplies numbers. No-target departments show "—" + muted "No target" pill. |
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
- `POST { mode: 'cron' }` — caller must present the service-role JWT (role claim checked).
  Runs the due-report logic below.

**Due-report logic (all in Asia/Dubai, pure TS module `report-schedule.ts`, unit-tested):**

- Monthly summary for month M−1: due on the 1st of M at 08:00; grace window 7 days.
- Reminder for month M: due on `lastDay(M) − 7` at 08:00; grace window 3 days.
- For each due report with no `sent` row in `report_runs`: compute → render → send via
  Graph `POST /users/sera@2seasonshotels.com/sendMail`; upsert the `report_runs` row
  (attempts++, status, `last_error` on failure). Sent later than the nominal day → the
  email carries a visible **"Delayed — originally due {date}"** banner.
- Outside a window or already sent → fast no-op.

**Failure modes, stated honestly:** a failed send retries every hour for the whole grace
window (≈ dozens of attempts), each logged. Residual silent risk: pg_cron itself dying
(the `whatsapp-auto-release` job has fired every minute since May — the best in-project
evidence) or Graph being down for an entire window; both end as a permanent `failed` row
in `report_runs` with `last_error`, never as an empty void. A skipped month is impossible
without a queryable trace.

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
- **Reminder email:** same table + Target | Gap | Status pill per row, headed by
  "X days left in {month}". Pills: green ≥100% of target, amber ≥50%, red <50%, gray
  "No target" (thresholds are constants, trivially adjustable). Zero rows show 0s.

---

## Azure Prerequisite (user action)

Draft `docs/it-requests/2026-07-30-mail-send-grant.md` (same format as the Sites.Selected
request): application **Mail.Send** on the existing edge app (`AZURE_CLIENT_ID`), admin
consent, plus `New-ApplicationAccessPolicy` restricting the app to `sera@2seasonshotels.com`.
Implementation is not blocked on the grant; **test-sends and go-live are**.

---

## Go-Live Sequence & Rollback

1. Migrations (targets + report_runs) with rollback twins → 2. function deployed →
3. user performs Azure grant → 4. user triggers test-sends for both reports, real data →
5. **only after user approval**, the cron migration (`cron.schedule('training-report-hourly',
'0 * * * *', net.http_post …)`, precedent: `20260515151557_schedule_whatsapp_auto_release.sql`)
goes live. The Authorization bearer for the cron call is the **service-role key read from
Supabase Vault** (`vault.decrypted_secrets`) — never hardcoded in the migration; the
precedent's `app.settings.service_role_key` GUC is not configured on this project (the live
whatsapp job fell back to a hardcoded anon key — a pattern this design explicitly avoids).

Rollback: `cron.unschedule` (rollback file), drop tables (rollback files), delete the
function; revoking Mail.Send in Azure kills sending instantly. Sent emails are unaffected.

## Out of Scope / Non-Goals

- No targets-editing UI (dashboard/SQL editing suffices for 14 rows).
- No SharePoint reads — the Supabase mirror is the reporting source (same decision as the
  Sera training query tool), with the data-quality footnote as the honesty valve.
- No changes to existing n8n workflows or the daily reviews email.
- No alerting side-channel beyond `report_runs` + delayed-send banners (any extra channel
  would share the same failure domains it is meant to watch).
