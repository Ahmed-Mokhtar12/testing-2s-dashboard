# Backlog

Named, queued work items. This file exists because a known caveat buried in a
design document fades, while a task with a name does not.

Each item states what is wrong, why it matters now, what "done" looks like, and
what it would cost. Nothing here is in progress. Ordered by the date it was
logged, newest first.

---

## B5 — clean-code findings in the $batch / participant-cap work

**Logged:** 2026-08-01 · **Found by** a clean-code guard pass over the six
commits that shipped the `$batch` write path and the 15 → 100 cap.

Seven findings, none of them a correctness bug. Recorded because a guard pass
that exists only in a chat reply is the same failure this repo has now hit twice
(see `docs/testing-lessons.md` sections 6 and 8 — knowledge that was written down
somewhere nothing reads).

### Do NOT fix these before the first successful training submission

This is the argument, not a preference:

`$batch` is deployed as **sp-submit-training v12** and its live behaviour has
never been observed. No Azure credentials exist in the dev environment and the
e2e suite mocks the function at the HTTP boundary, so the first real submission is
the only proof of the wire format.

Finding 1 is a refactor of `writeParticipantsInBatches` — **the exact function
whose live behaviour is unproven**. If it were refactored first and the next
submission then failed, the cause would be ambiguous between the batch format and
the refactor, and disentangling them means another deploy cycle to find out. The
whole point of a behaviour-preserving refactor is that it is invisible; that
property is worthless if it lands during the one window where an unexplained
failure is expected.

**This argument expires the moment a real submission succeeds.** After that the
format is proven, a later failure is attributable, and these should be fixed in
ONE commit and ONE redeploy — not three redeploys of the same function.

Nothing here carries behaviour risk, so deferring costs nothing but the debt.

### Findings, with evidence

| # | Severity | Finding |
|---|---|---|
| 1 | Med-High | `writeParticipantsInBatches` does three things — chunking, dispatching, classifying responses. **64 code lines** against a 20-line target; cyclomatic **~13–17** against a ceiling of 10 (`participant-batch.ts:89-170`). Fix: extract `classifyBatchResponses(chunk, responses) -> { retry, failed }`, which both shrinks the parent to ~25 lines and names the part that is actually subtle. |
| 2 | Med | `mutationFn` in `src/hooks/useTrainingSubmit.ts` is **113 code lines** (98 before the partial-write fix, so +15). Note the commit boundary was correct: extracting it inside the bug-fix commit would have bundled a refactor with a fix, which is its own violation. The debt is real and needs its own commit. |
| 3 | Med | **`batchSize` is speculative configurability, and it generated its own supporting artifacts.** No production caller passes it. Because it exists, the `Math.max(1, Math.min(...))` clamp exists; because the clamp exists, one of the 11 unit tests exists solely to cover it. Three artifacts, all passing, all justifying each other, zero production callers. Deleting the option removes a parameter, a guard and a test in one move — the cleanest single fix in the list. See `docs/testing-lessons.md` section 9. |
| 4 | Low | `describe(body)` in `participant-batch.ts` is an intent-less name that also collides with the testing-framework verb. Rename to `describeErrorBody`. |
| 5 | Low | `BatchSender` and `ParticipantFailure` are exported with **zero** external references — used only inside their own module. Just-in-case exports; drop the `export`. |
| 6 | Low | Missing boundary case: **exactly 20 items** (one full chunk, no remainder). Covered today: 0, 1, 3, 25, 30, 40, 45, 100. The 45-item case does exercise a full-chunk boundary, so the gap is small but it is the one arithmetic edge nothing hits directly. |
| 7 | Nit | `landedRows.length === 0 ? { error: null } : await supabase...` fabricates a success-shaped object to keep the destructuring uniform. Not a fake-success return (it is a local guard, not a value handed to a caller) but it is opaque; an explicit `if` reads better. |

### What the pass cleared, so it is not re-litigated

No catch-all error swallowing (the single `catch` reports all 20 rows as failed
rather than returning empty success); no hardcoded success values or fixture data
in production code; no weakened tests; the `{ fields }` request body was inherited
from the proven sequential implementation rather than copied from something
similar; comment-to-code ratio 0.43 in the new module, all explaining *why*.

Two checks that looked defensive were confirmed to be documented Graph
requirements — recorded as a lesson in its own right, see
`docs/testing-lessons.md` section 8.

**What "done" looks like.** One commit fixing 1–7, one redeploy via
`scripts/deploy-sp-submit-training.sh`, after a real submission has succeeded.

---

## B4 — a sent training report is never confirmed delivered

**Logged:** 2026-08-01 · **Raised by:** Ahmed, on the switch to a distribution list

Graph's `POST /users/{sender}/sendMail` returns **202 Accepted** — the message is
queued, not delivered. `graphFetch` throws only on a non-2xx, so nothing that
happens after acceptance can reach us: a rejected recipient, a moderation hold,
a full mailbox, a bounce. All of them produce an NDR in **`sera@`'s mailbox**,
which nothing monitors, while `report_runs` records `status='sent'`.

**Why now.** Recipients changed from three individual mailboxes to
`Departmental.Trainers@2seasonshotels.com` on 2026-08-01. A DL adds two rejection
paths that individual mailboxes do not have:

- `AcceptMessagesOnlyFromSendersOrMembers` — an explicit allow-list of permitted
  senders, common on lists like this one. `sera@` would not be on it.
- `ModerationEnabled` — the message waits for an approver instead of being
  delivered, indefinitely and invisibly.

Both are silent on our side. Ahmed's framing: *"a delivery failure to a DL is
exactly the kind of thing that looks like success on our side."*

**What "done" looks like.** Reconcile after sending rather than trusting the
202: read `sera@`'s mailbox for NDRs correlated to a send (by subject, or by a
token planted in the message), and flip the matching `report_runs` row to
`failed` with the bounce text in `last_error`. The outstanding-failure banner
then surfaces it on the next report without any new mechanism.

**Cost and risk.** Needs a Graph **`Mail.Read`** application permission the app
does not currently hold, which means an IT request and admin consent (model it on
`docs/it-requests/2026-07-31-mail-send-mailbox-scoping.md`). Note this is the
same missing half as **B1**: we confirm the *request* and never the *outcome*.
B1 is "did it send twice", B4 is "did it arrive at all" — related enough that
whoever does one should read the other, distinct enough that neither fixes the
other.

**Interim mitigation, no code.** After any recipient change, check `sera@`'s Sent
Items (Graph accepted) and Inbox (an "Undeliverable:" NDR) within five minutes of
the first real send, and have one person on the list confirm receipt.
`mode:'test'` cannot substitute — it sends to the caller, never to `RECIPIENTS`.

---

## B3 — the live auth config is not in version control, and nothing checks it

**Logged:** 2026-08-01 · **Found while** diagnosing the Microsoft sign-in outage

The Azure Tenant URL was changed from the tenant GUID to the tenant domain some
time after 2026-06-11 — the last successful Microsoft login. Nothing in the repo
records the change, nothing asserts the live value, and nothing failed until
users did. Sign-in was broken for **every** account for an unknown number of
weeks; the only reason it surfaced when it did is that somebody tried.

The correct value has been written down since 2026-06-09 in
`docs/superpowers/plans/2026-06-09-azure-ad-login.md:56` — *"Azure Tenant URL:
`https://login.microsoftonline.com/<Directory-tenant-ID>`"*. Being written down
did not help, because nothing read it. That is the point of this item: the
knowledge existed and was not connected to anything that could fail.

**Why now.** Every gate in this repo covers code. The auth configuration is a
dashboard setting with the same power to lock every user out, and zero coverage —
no typecheck, no test, no deploy script, no review. It is the largest uncovered
surface left that can take the whole product down.

**What "done" looks like.** A committed expectation for the few auth settings
that are load-bearing, and a manual script that diffs the live config against it:

- Azure Tenant URL == `https://login.microsoftonline.com/2e9f09ed-8e4e-48d6-b37e-77b4bd4941a4`
- signup disabled
- email provider enabled (the password fallback depends on it, and it is the only
  fallback the three azure-only mailboxes do *not* have)
- **Azure app registration permissions**, added 2026-08-03. The Graph app holds
  Graph application permissions only. `sp-read-trainers` now reads the tenant
  directory (`User.Read.All` or equivalent — proven to work, since an earlier version
  of that function listed `/users` in production), and `sp-submit-training` needs a
  **SharePoint** application permission it does not have: `Sites.Manage.All`, or
  `Sites.FullControl.All` if Manage proves insufficient, with tenant admin consent.
  Without it `_api/web/ensureuser` is unreachable and a trainer who has never opened
  the site cannot be recorded. Both are dashboard settings with the same shape as the
  Tenant URL: load-bearing, invisible to every gate, and discoverable only when
  somebody tries. The expectation to commit is the permission list itself, and the
  check is one client-credentials request per audience — `graph.microsoft.com` and
  `2seasonshotels.sharepoint.com` — asserting a token comes back for each.

Read the live values from `GET /v1/projects/{ref}/config/auth` with a management
token, print a diff, exit non-zero on any drift. Same operator-run shape as
`scripts/deploy-*.sh`, for the same reason: it needs a token that must not live
in this repo, so it can never join the hermetic `test:unit` gate.

**Cost and risk.** Small — one script, one expectations file. The real judgment
call is *which* settings to pin: pin everything and the diff becomes noisy, gets
ignored, and joins the list of checks that report green because nobody reads
them. Pin only what would be an outage.

---

## B1 — Training report emails are at-least-once, not exactly-once

**Logged:** 2026-08-01 · **Raised by:** Ahmed, on the weekly-cadence switch

Graph `sendMail` has no idempotency key, and the ledger row is written *after*
the send. So if the Graph POST succeeds but its response is lost — network blip,
function timeout, cold-start kill — `report_runs` still reads `failed` (or holds
the in-flight claim), the next hourly cron tick retries, and a **second, genuine
duplicate email** reaches the three managers. `report_runs`' primary key
prevents duplicate ROWS; it cannot prevent duplicate SENDS.

**Why now.** The weekly cadence took the reminder stream from 12 sends a year to
52, and total volume from ~24 to ~63 — a 2.6× rise in exposure to a per-send
risk. Nothing about the mechanism changed; the number of dice rolls did. Ahmed's
call was to log it as its own item rather than leave it as a paragraph in the
cadence design, precisely so the frequency increase does not quietly normalise
it.

**Current partial mitigations** (both real, neither sufficient):
- `claimRun` stamps the row with `CLAIM_SENTINEL` *before* sending, so a
  concurrent invocation cannot also send, and a crashed run is only retried
  after `CLAIM_STALE_MS` (15 minutes). This narrows the window to
  "response lost, then 15+ minutes pass, then a tick fires".
- The failure is loud on the ledger side — a duplicate leaves `attempts > 1`.

**What "done" looks like.** Record intent before the send and reconcile after,
rather than recording only the outcome:
1. Write `status='sending'` with a deterministic idempotency token before the
   Graph call.
2. On retry of a row already in `sending`, do **not** re-send blindly — query
   the sender mailbox (`GET /users/{sender}/messages` filtered on the token or
   on subject + sentDateTime) to establish whether the previous attempt landed,
   and only send if it did not.
3. Keep the 15-minute staleness release as the backstop for a genuinely dead
   attempt.

**Cost and risk.** Touches the claim/record path — the single most
concurrency-sensitive part of this feature, and the one whose behaviour is
verified live (A wins, B loses on a stale token, `attempts` stays 1). It also
adds a Graph read scope the app does not currently use. Deliberately NOT bundled
into the cadence switch: a cadence change should not be the commit that rewrites
the send-idempotency contract.

---

## B7 — nothing would notice TrainerNames drifting from trainer_names

**Logged:** 2026-08-03 · **Raised by:** Ahmed, while agreeing the format contract for
the new `TrainerNames` column.

**The gap.** Trainers are written to two places: `training_sessions.trainer_names` in
Postgres, and the `TrainerNames` text column on Monthly_Training. **Nothing in this
system reads `TrainerNames` back.** So a divergence — the PowerApp joining with a
comma, a hand-typed backfill row with a double space, a session written to one store
and not the other — would sit there indefinitely, because no code path compares them.
The format contract in
`docs/superpowers/specs/2026-08-03-trainer-field-is-the-participant-picker-design.md`
is agreed precisely because no test can enforce it.

**Why the monthly report is the right place.** `training-report` already reads every
session in the period from `training_sessions`, and each row carries `sharepoint_id`.
So it can fetch those items' `TrainerNames` and compare against `trainer_names` — a set
comparison per session, no new infrastructure, no new schedule.

**What "done" looks like.**

- A **data-quality note beside the existing sync-mismatch line** in the report, not a
  separate alarm. The report already reports `mismatchCount` for
  `sync_status !== 'synced'` and count disagreements; this is the same shape.
- **Degrades to "comparison skipped" on a Graph hiccup**, never fails the send. The
  report's job is to go out; a diagnostic that can block it is worse than no
  diagnostic. `report-aggregator.ts` takes plain rows today, so the comparison belongs
  outside it or behind an optional argument.
- Names the specific divergence — which session, which store held what — because
  "1 mismatch" is not actionable.
- **Collapses whitespace on BOTH sides before comparing.** Not a nicety — without it the
  very first thing this check reports is a name that is correct. Proven by hand on
  2026-08-04: nine of ten recorded trainer names matched `ColleagueName` exactly and the
  tenth, session 23, did not, because Colleagues_Master holds
  `"Muhammed Muhammed  Zawahir"` with a double space (26 characters, employeeId 101710)
  and the format contract collapses runs of whitespace. Commit 2 wrote the single-spaced
  form deliberately and correctly. A comparison that skips the collapse therefore
  false-positives on every colleague whose stored name contains repeated whitespace, and
  a data-quality note whose first finding is a false alarm is a note nobody reads twice.
  Use the same rule both sides — `value.replace(/\s+/g, ' ').trim()`, the one in
  `src/lib/trainer-names.ts` and `supabase/functions/_shared/trainer-names.ts`.

**THE CAVEAT THAT MUST NOT BE LOST.** This check **only sees sessions Postgres already
knows about**, because that is what the report iterates. A session recorded in
SharePoint and never written to Postgres is invisible to it. So it is *not* coverage of
the store-to-store leak — the separate finding that `sharepoint_id` 20 and 21 exist in
Postgres but not the list.

(That leak was described here as bidirectional when this item was logged, on the strength
of a "Housekeeping" row existing in the list but not Postgres. It was a hand-made probe —
13+ trainers against `Total Participants` = 2 — and was deleted on 2026-08-03. The leak is
one-directional: the report can over-count, but no session is invisible to it. The caveat
above stands either way, because it is about what this check *iterates*, not about which
direction the leak runs.)
Whoever picks this up must not mistake one for the other: this catches **content**
drift on rows both stores hold, and says nothing about rows only one store holds.
Detecting the latter needs a SharePoint-side enumeration, which is a different task.

**Not built, by decision** — logged rather than implemented so the trainer field ships
first.

---

## B6 — a script needing a dashboard JWT should try the password grant first

**Logged:** 2026-08-03 · **Raised by:** Ahmed, after getting the probe's JWT flow
wrong twice — pasted into the browser console once, and into the shell prompt
instead of into `read` once.

`scripts/probe-colleague-columns.sh` asked for a JWT the hard way: open DevTools,
read `localStorage`, copy the token, then `read -rs PROBE_JWT; export PROBE_JWT`.
The security reasoning is sound and is not in question — a token pasted as
`PROBE_JWT=<token> bash ...` lands in world-readable `/proc/<pid>/cmdline`, and
`read -rs` keeps it out of both argv and the shell history.

**The mistake was choosing generality nobody asked for.** The browser route works
for every account including the three Azure-only ones (`info@`, `teleopr@`,
`2srewards@`, which have no password at all). But the operator running these
scripts has a Supabase password, so the password grant that
`scripts/send-training-report-test.sh` already implements would have worked — and
that script *also* falls back to the browser instructions when the grant fails. The
probe reimplemented only the fallback.

**What "done" looks like.** Any future script needing a user JWT tries the password
grant first and falls back to the browser instructions, matching
`send-training-report-test.sh`. The obvious form is a shared
`scripts/lib/get-admin-jwt.sh` sourced by all of them.

**Deliberately NOT extracted now**, at Ahmed's decision: converting the three
existing admin-gated scripts is a bigger change than it sounds, and it touches the
paths that send real email. This entry exists so the next script written does not
repeat the choice.

---

## B2 — nothing type-checks supabase/functions (QUEUED TASK, not just a note)

**Logged:** 2026-08-01 · **Found while** verifying the weekly-cadence change
**Upgraded to a task** 2026-08-01 at Ahmed's request: "That's the same shape as
the vacuous tsc — not a wrong check, an absent one, and invisible because
everything downstream reported green." The function three people read numbers
from is inside the unchecked directory, which is the reason it is a task.

Nothing type-checks `supabase/functions` in this repo. `npm run typecheck`
covers `tsconfig.app.json` and `tsconfig.node.json`, neither of which includes
that directory (Deno-style `.ts` specifiers and `jsr:`/`npm:` imports do not
resolve under plain `tsc`), and the Supabase platform bundles without checking
types. `tests/unit/edge-imports-resolve.test.ts` verifies that every relative
import RESOLVES, which is a different and much weaker property.

Running an actual type-checker over the tree for the first time:

```
# The config MUST be a real file. Passing it via process substitution
#   --config <(echo '{...}')
# fails with: failed to create directory '/proc/<pid>/fd/node_modules/.deno/…'
# because --node-modules-dir=auto resolves node_modules relative to the config
# file's own directory, and /proc/<pid>/fd is not a real directory.
cat > /tmp/deno-check.json <<'JSON'
{"compilerOptions":{"lib":["deno.window","deno.ns","dom","dom.iterable","esnext"]}}
JSON
npx --yes deno@2 check --node-modules-dir=auto --config /tmp/deno-check.json \
  supabase/functions/*/index.ts
```

**Result: 31 errors across the other functions; `training-report/index.ts` is
clean.** These are a LEAD, not 31 confirmed bugs — the mix is:
- 10 × `TS2345` `'string | undefined'` not assignable to `'string'`
- 7 × `TS18046` `'error' is of type 'unknown'`
- 4 × `TS7006`/`TS7022` implicit `any`
- a handful of narrowing complaints.

**CORRECTION, and it matters for how this task is scoped.** I originally
singled out `Property 'reviews' does not exist on type 'never'` in
`chat-with-data/index.ts:217` as the one that "smells like a real defect", and
Ahmed reasonably asked for the task to be built around it. It is not a defect.
`specificData` is `const specificData = null` at `index.ts:126`, deliberately, so
the checker narrowing it to `never` is CORRECT — it is reporting that
`dataPoints: specificData?.reviews?.length || ... || 'general'` has always
evaluated to `'general'`. And `queryAnalysis.dataPoints` is consumed nowhere:
zero references across `src/` and `supabase/functions/`. So it is dead weight in
a response payload, not a number anyone reads.

Which leaves the honest position: **there is no known real bug in the 31.** They
are strictness gaps and dead code. The reason to do this task is the ABSENT
CHECK, not any error currently in the list — nothing has been verifying edge code
all week, so the next real defect there would also be invisible. Scope it that
way, and treat the 31 as cleanup encountered on the way.

An earlier run without the `dom` lib reported 37; six of those were an artifact
of the ad-hoc config, not the code. Anyone re-running this must use a real
config before believing a count.

**What "done" looks like.** A committed `supabase/functions/deno.json` with the
right `lib` and `strict` settings, the 31 triaged into real bugs vs. annotation
gaps, the real ones fixed, and a documented `npm run typecheck:edge`.

**Cost and risk.** Two open questions before starting. First, `deno` is not
installed on this host and the invocation above fetches it through `npx` on
every run — making this a real gate means either a ~100 MB devDependency (in a
repo that just had 19 packages and 5 MB removed) or a documented manual step.
Second, the check needs network to resolve `jsr:` and `npm:` specifiers, so it
can never join the hermetic `test:unit` gate. Worth deciding deliberately rather
than adding on impulse.

---

## B8 — five colleagues are stored collapsed as trainers and raw as participants

**Logged:** 2026-08-04 · **Found while** answering whether the double space in
Colleagues_Master should be fixed at source rather than collapsed by every consumer.

**The gap.** `useTrainingSubmit` writes the same person's name two different ways in the
same submission:

- **trainers** go through `toTrainerNames` (`src/lib/trainer-names.ts`), which collapses
  runs of whitespace and trims — so `training_sessions.trainer_names` holds
  `"Muhammed Muhammed Zawahir"`.
- **participants** are written raw — `colleagueName: colleague.colleagueName` at
  [useTrainingSubmit.ts:63](../src/hooks/useTrainingSubmit.ts) into
  `training_participants.colleague_name` — so that same colleague, in the same session,
  is stored as `"Muhammed Muhammed  Zawahir"`, double space intact.

**This is already wrong in production, independently of the trainer work.** Sera searches
participants by substring:

```ts
(p.colleague_name ?? '').toLowerCase().includes(needle)
```

[training-aggregator.ts:147](../supabase/functions/chat-with-data/training-aggregator.ts).
A needle typed the way any human types it — with one space — **does not match** a stored
double space. So "which trainings did Muhammed Muhammed Zawahir attend" silently returns
nothing, or too little. No error and no explanation: exactly the shape
`docs/testing-lessons.md` §12 describes, where a heuristic's miss is indistinguishable
from a genuine absence.

**Measured 2026-08-04 — it is not one row, it is six.** Out of 336 colleagues, five names
and two positions carry repeated or leading whitespace (`··` marks a double space):

```
101187  Kazi Belayet··Hossai kazi Abdul Awal
101322  Walid··Abd El Monem Mahmoud
101710  Muhammed Muhammed··Zawahir      + position " IT Manager" (leading)
102188  Abdelfattah Abdelwahed··Ghallab
102613  Nuwan··Buddhika kuma Bandara Arachchilage
101270  position "Executive Secretary··/PA"
```

So five colleagues — not one — are currently stored two ways in the same session, and
Sera's substring search misses all five. `102188` is Abdel Fattah Ghallab, who is on the
operator's actual trainer list, so this was going to be hit by a real trainer and not only
by a hypothetical participant.

**THE APP ITSELF CREATES THESE.** This was assumed to be hand-editing in SharePoint. It is
not only that: `sp-manage-colleague` validates for emptiness with `.trim()` and then writes
the **raw** value —

```ts
if (!c.colleagueName?.trim() || ...) { /* reject */ }
...
Title: c.colleagueName,
ColleagueName: c.colleagueName,
```

[sp-manage-colleague/index.ts:69,80-82](../supabase/functions/sp-manage-colleague/index.ts),
and again in the update branch at :120,124-125. Neither `AddMemberForm` nor
`EditMemberForm` normalises before sending. So the Manage Members tab will happily create
the next dirty row, and even a plain leading space survives a guard that trims one line
above the write.

**"Done" is four things, in this order.**

1. ~~**Collapse where a name ENTERS the system**~~ — **DONE 2026-08-04.** Both branches of
   `sp-manage-colleague` now call `collapseColleagueFields`, and so do both member forms,
   so the confirmation dialog states the value that will actually be stored. All four text
   fields, not just the name — position, section and department travel into
   `training_participants` the same way, and two of the six dirty rows were positions. The
   rule is declared once per runtime (`supabase/functions/_shared/text.ts`,
   `src/lib/text.ts`) with `tests/unit/colleague-fields-agree.test.ts` failing the build if
   they disagree.
2. **Collapse on the participant write** in `useTrainingSubmit`, as the backstop for names
   that arrive from a hand-edit rather than through our form. Demoted from "the fix" to
   "defence in depth" by the finding above, but not removed — the list is still editable
   directly.
3. **Normalise the existing `training_participants.colleague_name` values** the way
   `20260803190000` normalised the trainer names, with the same per-`training_id`
   rollback and for the same reason. Without this the five colleagues above stay
   unsearchable in every session already recorded.
4. ~~The six **source rows**~~ — **DONE 2026-08-04** by the operator, as data-entry typos
   wrong on their own terms rather than as an accommodation to our contract.

**So what remains is 2 and 3**: the participant-write backstop, and the migration for the
`training_participants` rows already written. Neither is urgent — the entry point is closed
and the data is clean, so the set cannot grow through our own UI — but 3 is the only thing
that repairs the five colleagues' existing history, and until it runs those sessions stay
unfindable in a Sera participant search.

**Why 4 does not make 1–3 redundant.** Fixing the data empties the current set; it changes
neither the way a name gets IN nor the two-writers disagreement in how it gets STORED.
Clean data hides that disagreement instead of removing it — and a hidden one is worse,
because the symptom today is a five-example reproducible pattern and the symptom after
the next paste is a single mysterious case with the diagnosis to redo from scratch.
Fixing data without fixing the write path converts a class into a future one-off.

**Not urgent, but no longer trivial.** Five colleagues, one of them a working trainer, and
the affected reader is a Sera search that returns too few rows rather than wrong ones.

---

## B9 — trainers are stored by name alone, so a mis-pick is undetectable

**Logged:** 2026-08-04 · **Raised by:** Ahmed, asking whether anything cheap could make a
wrong trainer selection visible after the fact.

**The gap.** `training_sessions.trainer_names` is `text[]`. If two active colleagues shared
a `ColleagueName` and the wrong one were chosen in the picker, the stored value would be a
perfectly valid name and **no check anywhere could detect it** — after the fact, a name
that identifies the wrong person is indistinguishable from one that identifies the right
person. Participants do not have this problem: `training_participants` stores
`employee_id`, so a mis-picked participant is detectable. Trainers are the only role stored
by name alone, which is the direct and accepted cost of the plain-text decision that made
colleagues without a Microsoft account recordable at all.

**MEASURED, AND CURRENTLY EMPTY — this is why it is logged rather than built.** On
2026-08-04, grouping the 336 active colleagues by `ColleagueName` returned **zero**
duplicates. There is no ambiguous pick available to make, so the risk today is nil, and
building a schema change against it would be building against a hypothetical. Recorded as
measured rather than assumed away, so the next reader does not have to re-derive it.

**The trigger.** A second active colleague sharing an existing `ColleagueName` — most
likely a new hire, or a re-hire creating a second row for the same person. At that moment
this stops being hypothetical and the fix below becomes worth its cost.

**What "done" looks like.** A `trainer_employee_ids` column beside `trainer_names`, written
from the same `Colleague[]` the picker already holds, with the names kept for display.
Two payoffs, not one: a mis-pick becomes detectable forever, and **B7's drift check gets a
reliable key** instead of comparing names — which is what forces B7 to collapse whitespace
on both sides today.

**Cheap mitigation, already agreed and not a substitute.** The confirmation step shows every
participant with their Employee ID and shows trainers as name-only badges, so trainers are
the one thing on the review screen a human cannot verify. Adding the ID to those badges
puts the discriminating fact in front of someone at the last moment it can still be caught,
and it survives in a screenshot. Folded into commit 8 of the trainer-field work. It is
prevention-adjacent, not detection: it does nothing for a row already written.
