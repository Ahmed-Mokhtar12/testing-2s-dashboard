# Testing lessons

Failures this codebase has actually had, and what caught them. Kept because each
one is a *shape* that recurs, not a one-off — and because in every case the
symptom was something reporting green.

Read this before writing a test you intend to trust.

---

## 1. The canonical example: the plausible implementation

**Rule: when a rule depends on the calendar, key the test on the calendar.**

The weekly training email skips one Friday a year — when the 1st of the month
falls on a Friday, the monthly summary wins. The obvious implementation is:

```ts
// WRONG, and a reviewer would nod at it
const summaryWinsToday = due.some((r) => r.reportType === 'monthly_summary');
```

That reads correctly, states the intent in words, and is wrong. The monthly
summary stays due for its **entire month**, not just the 1st, so this skips
*every* Friday of *every* month. The weekly would never send again — and because
a skip is a recorded, successful outcome, the cron would report success forever.
Total, silent, and indistinguishable from working.

The right version keys on the calendar fact, which is the thing the rule is
actually about:

```ts
const summaryWinsToday = occDay === 1;
```

**No test of the happy path catches this.** The first Friday of a month behaves
identically under both. What catches it is a test asserting that the *later*
Fridays of a month whose 1st was a Friday are NOT skipped — and asserting, in
the same test, that the summary genuinely is still due on those dates, so the
test cannot pass by everything being quiet:

```
tests/unit/report-schedule.test.ts
  → 'weekly: later Fridays of a month whose 1st was a Friday are NOT skipped'
```

Verified by mutation: swapping the correct line for the plausible one fails with
`2027-01-8 must not be skipped`. The next real occurrence of this calendar case
is 2027-01-01, so for five months after shipping, that test was the only thing
in the world that could have told us.

**Generalisation.** "X wins over Y" rules are usually about a *moment*, while the
things they compare are often *windows*. If you implement the rule by asking
"is Y present?", you have silently widened it to Y's whole window.

---

## 2. The vacuous-check family

Three instances in one week. Each was reporting green, and each was checking
nothing:

| what | why it passed | how it was caught |
|---|---|---|
| `npx tsc --noEmit` at the repo root | root `tsconfig.json` has `files: []` + `references`, so it loads no files and exits 0 | planted a deliberate type error; it still passed |
| `supabase/functions` type-checking | there was none — tsconfig excludes it, deno is not installed here, and the platform bundles without checking | ran `deno check` for the first time; `training-report` clean, 31 errors elsewhere |
| `scripts/sera-battery.sh` with no token | `exit 1` inside `JWT=$(obtain_jwt)`'s command-substitution subshell, and no `set -e`, so it ran 24 calls that all 401'd and printed `RESULT: 8 case(s) did not pass` | a real password typo, and then a minimal repro |

**Rule: prove a check can fail.** Before trusting any gate, break the thing it
guards and watch it go red. A gate that has never failed in your presence is not
a gate.

**Rule: a tool that reports results must refuse to report when it has none.**
The battery now aborts with "Nothing was run" rather than formatting an
infrastructure failure as eight test results. Failure must not be allowed to wear
the costume of a result.

---

## 3. Anti-vacuity assertions

A test can stop testing without failing. Both of these are real:

- `tests/full-viewport.spec.ts` seeds 15 participants through the draft-restore
  path and asserts the wizard column overflows. **15 empty rows also overflow**,
  so the seeding is verified too — first and last rows must render
  `colleagueName (employeeId)`, and there must be exactly 15. Mutation-checked
  both ways: `colleague: null` fails the row guard, and seeding one participant
  (guards removed) drops the overflow to 0 and fails the layout assertion.
- `tests/unit/edge-imports-resolve.test.ts` walks a directory and checks every
  relative import. A broken walker or regex would find nothing and pass, so it
  asserts it scanned `> 20` files and `> 50` imports first.

**Rule: if a test's setup could silently produce nothing, assert the setup.**

---

## 4. Ground truth goes stale in days, not months

`scripts/sera-battery.sh` shipped with ground truth dated 2026-07-31 and was
wrong within 24 hours: it demanded 33,526 WhatsApp messages, the system answered
33,528, and 33,528 was correct. The reviews backfill would have invalidated three
more cases, including one whose whole premise was that a month had no reviews —
which the backfill exists to fix.

**Rule: derive expectations at run time from the same source the system reads,
and fail closed.** If the derivation errors, or returns 0 where rows are
expected, abort — an expectation that collapses to 0 makes a case pass for the
worst possible reason. Where a value can legitimately move mid-run, bracket it
(read before and after, accept the window) rather than pinning one number.

Fixtures that are arbitrary *by design* are fine — say so in a comment, so
nobody quotes them as live figures (see the `7888` note in
`tests/unit/paged-fetch.test.ts`).

---

## 5. Grep is not a reachability check

Twice, dead code looked live:

- Four dead `chat-with-data` modules imported **each other**, so every one had a
  referrer.
- `ui/toggle.tsx` was imported by `ui/toggle-group.tsx` — and nothing imported
  `toggle-group`.

And once, live code looked dead: a grep for `error-handler` matches both the dead
`error-handler.ts` and the live `enhanced-error-handler.ts`.

**Rule: check reachability from an entry point, then confirm with a second,
independent method** (import specifiers *and* exported-symbol names). One-way
greps keep dead clusters alive forever.
