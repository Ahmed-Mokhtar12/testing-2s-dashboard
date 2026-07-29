# Sera Training Query Tool — Design Spec

**Date:** 2026-07-29
**Project:** Two Seasons Insights Dashboard
**Feature:** Give Sera (AI consultant) access to hotel training records via a function-calling tool

---

## Overview

Sera currently has no working access to training data: `chat-with-data/index.ts` fetches a
`Conducted Training` table that does not exist, so the fetch fails silently on every request.

This feature adds a **`query_training_records` tool** to Sera's existing function-calling
mechanism (the same machinery `search_web` uses). When a user asks a training question
("How many training hours did Front Office complete in the last 7 days? How many people,
how many trainers?"), the model calls the tool with filters; the tool queries the **Supabase
mirror tables** (`training_sessions`, `training_participants`) and computes exact aggregates
in code. The model then answers from those numbers.

---

## Decisions Made

| Topic | Decision |
|---|---|
| Data source | Supabase mirror only (`training_sessions` + `training_participants`). Dashboard-registered sessions are the complete universe; no SharePoint read needed. |
| Detail level | Full detail — aggregates AND individual-level answers (participant names, per-employee history). |
| Access | All logged-in dashboard users; no admin gating inside Sera. |
| Mechanism | Function-calling tool with code-computed aggregates (not prompt injection). |
| Second tool round | Not needed — existing two-pass flow (tool call → tool result → final answer) is sufficient. |

---

## Tool Contract

**Name:** `query_training_records`

**Parameters** (all optional):

| Param | Type | Meaning |
|---|---|---|
| `date_from` | string `YYYY-MM-DD` | Inclusive start, interpreted in Asia/Dubai (+04:00) |
| `date_to` | string `YYYY-MM-DD` | Inclusive end, interpreted in Asia/Dubai (+04:00) |
| `department` | string | Case-insensitive partial match (`ilike %term%`) on `training_sessions.department` |
| `employee` | string | Matches `training_participants.employee_id` (case-insensitive exact) OR `colleague_name` (case-insensitive partial) |
| `detail` | `"summary"` \| `"sessions"` \| `"participants"` | Default `"summary"` |

**Result** (JSON string returned as the tool message):

- Echo of the applied filters (resolved date range, matched departments) so the model can
  state the period it answered for.
- **Summary block** (always): `total_sessions`, `total_hours` (sum of `duration_minutes` / 60,
  1 decimal), `total_attendances` (participant rows), `distinct_participants` (unique
  `employee_id`), `distinct_trainers` (unique names across `trainer_names` arrays),
  `departments_covered`.
- **Per-department breakdown** (when no `department` filter): same metrics per department.
- `detail: "sessions"` adds each session: date, title, department, duration minutes, location,
  trainer names, participant count.
- `detail: "participants"` adds participant names/IDs/positions per session.
- `employee` filter restricts everything to sessions that employee attended and adds the
  employee's attendance list.
- **Empty result:** explicit `"no_training_records_found": true` with the filters echoed, so
  Sera reports "no records for that period/filter" instead of inventing numbers.
- **Caps:** 500 sessions / 2000 participant rows per query; if hit, the result includes a
  `truncated: true` flag with instructions to narrow the date range.

### Aggregation semantics

- Date filter: `training_date >= {date_from}T00:00:00+04:00` and
  `training_date < {date_to + 1 day}T00:00:00+04:00`.
- Distinct participants counted by `employee_id`; distinct trainers by name string.
- Aggregation happens in TypeScript in the edge function (data volume is small — a hotel's
  monthly training sessions), implemented as a **pure function** so it is unit-testable.

---

## Code Changes

All in `supabase/functions/chat-with-data/` unless noted.

1. **New: `training-query-service.ts`**
   - Tool JSON schema (`getAvailableFunctions()` style, mirroring `SearchService`).
   - `executeFunction()` — parses args, queries Supabase with the service-role client,
     calls the pure aggregator, returns JSON string.
   - Pure `aggregateTrainingData(sessions, participants, filters)` function.

2. **`function-call-handler.ts`**
   - Instantiate `TrainingQueryService`; append its schema in `getAvailableTools()`.
   - Add `isTrainingFunction()` branch in `executeToolCalls()`; on error return an English
     tool message ("training data temporarily unavailable") — do not throw.

3. **`search-decision-engine.ts`**
   - `analyzeSearchRequirement` / `determineToolChoice` currently **force** `search_web`
     when the message contains keywords like "today"/"current" and no rich DB context.
     Add a training-keyword check (training, تدريب, trainer, session hours, etc.): if the
     message is training-related, never force `search_web`; return `'auto'` so the model
     can pick `query_training_records`.

4. **`system-prompt-builder.ts`**
   - Add training records to the evidence-base list; instruct: for any question about
     training hours/sessions/participants/trainers, **always call `query_training_records`
     and use only its numbers — never estimate**.

5. **`index.ts`**
   - Remove the dead `Conducted Training` fetch and its `conductedTraining` key.

6. **`data-availability-checker.ts` / `enhanced-context-builder.ts` / `context-section-builder.ts`**
   - Remove/adjust references to `conductedTraining` so nothing breaks; mark training as an
     available data type answered via the tool.

7. **Bug fix — `context-section-builder.ts:172`**
   - Replace hard-coded `"Today's reference date is January 2, 2025"` with the real current
     date in Dubai time (reuse `timezone-utils.ts`). Required for correct "past 7 days" math.

**Not touched:** SharePoint functions, frontend, RLS/migrations (edge function uses the
service-role key, consistent with all of Sera's other data access), dead-code modules
(`enhanced-data-service.ts` etc.) stay as they are.

---

## Error Handling

| Failure | Behavior |
|---|---|
| Supabase query error | Tool returns `{ error: "Training data temporarily unavailable" }`; Sera apologizes and does not fabricate. |
| Invalid date strings | Tool returns a descriptive error string the model can act on. |
| Reversed range (`date_from` > `date_to`) | Tool silently swaps them and proceeds. |
| Unknown department (no match) | Empty result + `departments_available` list so the model can correct itself in its answer. |
| Model never calls the tool | System-prompt instruction (change 4) plus tool-choice fix (change 3) minimize this; acceptance test verifies. |

---

## Testing

1. **Unit tests** (Deno) for `aggregateTrainingData`: hour totals, distinct participant and
   trainer counts, Dubai-timezone date boundaries, department/employee filters, empty result,
   truncation flag.
2. **Live verification** after deploying `chat-with-data`: ask Sera in the dashboard
   (a) "How many training hours did [department] complete in the last 7 days, how many
   people and trainers?" — cross-check against the mirror table;
   (b) a period with no records — Sera must say none found;
   (c) an individual question — "Which colleagues attended [session]?".

---

## Out of Scope

- Reading SharePoint directly / importing historical SharePoint-only records.
- Admin-only gating of training answers inside Sera.
- Prompt-injected training snapshots.
- A second tool-calling round (multi-step tool chains).
- Cleanup of Sera's unrelated dead code and stale table names (`Hotel Reviews`, etc.).
