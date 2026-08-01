# Backlog

Named, queued work items. This file exists because a known caveat buried in a
design document fades, while a task with a name does not.

Each item states what is wrong, why it matters now, what "done" looks like, and
what it would cost. Nothing here is in progress. Ordered by the date it was
logged, newest first.

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
