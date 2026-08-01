# Backlog

Named, queued work items. This file exists because a known caveat buried in a
design document fades, while a task with a name does not.

Each item states what is wrong, why it matters now, what "done" looks like, and
what it would cost. Nothing here is in progress. Ordered by the date it was
logged, newest first.

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

## B2 — 31 type errors in the edge functions nobody had ever type-checked

**Logged:** 2026-08-01 · **Found while** verifying the weekly-cadence change

Nothing type-checks `supabase/functions` in this repo. `npm run typecheck`
covers `tsconfig.app.json` and `tsconfig.node.json`, neither of which includes
that directory (Deno-style `.ts` specifiers and `jsr:`/`npm:` imports do not
resolve under plain `tsc`), and the Supabase platform bundles without checking
types. `tests/unit/edge-imports-resolve.test.ts` verifies that every relative
import RESOLVES, which is a different and much weaker property.

Running an actual type-checker over the tree for the first time:

```
npx --yes deno@2 check --node-modules-dir=auto --config <(echo '{"compilerOptions":{"lib":["deno.window","deno.ns","dom","dom.iterable","esnext"]}}') \
  supabase/functions/*/index.ts
```

**Result: 31 errors across the other functions; `training-report/index.ts` is
clean.** These are a LEAD, not 31 confirmed bugs — the mix is:
- 10 × `TS2345` `'string | undefined'` not assignable to `'string'`
- 7 × `TS18046` `'error' is of type 'unknown'`
- 4 × `TS7006`/`TS7022` implicit `any`
- a handful of narrowing complaints, of which `Property 'reviews' does not
  exist on type 'never'` in `chat-with-data` is the one that most smells like a
  real defect rather than missing strictness annotations.

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
