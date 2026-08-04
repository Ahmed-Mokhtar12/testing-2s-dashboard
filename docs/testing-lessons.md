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

---

## 6. A hypothesis that explains every symptom can still be wrong

**Rule: before explaining a failure, read the failure.**

Microsoft sign-in stopped working. The known facts fitted one story exactly:
`disable_signup` had recently been turned on, every affected account had an
`email` identity but no `azure` one, and creating an identity looks a great deal
like a signup. That story accounted for every observation — including why the
three azure-only mailboxes were believed to be fine. It was wrong.

One line of the auth log settled it:

```
azure: ID token issuer "https://login.microsoftonline.com/<tenant-guid>/v2.0"
  does not match expected issuer "https://login.microsoftonline.com/2seasonshotels.com/v2.0"
→ 500: Error getting user profile from external provider   (path /callback)
```

The Azure Tenant URL held the tenant **domain** where GoTrue needs the tenant
**GUID**. Issuer validation happens while parsing the ID token — before any user
lookup — so it fails identically for every account and never reaches the signup
or linking decision. `disable_signup` was never consulted. Two unrelated changes
landed near each other and the nearer one got the blame.

Two things made the wrong story convincing, and both are shapes that recur:

- **Stored state was read as a result.** The three azure-only mailboxes have
  `azure` rows in `auth.identities`, so they were assumed to still work. They did
  not — with issuer validation failing for everyone and no password set, they
  were the *only* accounts with no way in at all. The believed-healthy set was
  the worst-affected set. This is `relrowsecurity = true` versus a refused INSERT
  again (CLAUDE.md → Database): a row records something that worked once, under a
  configuration that may since have changed.
- **The obvious verification would have passed vacuously.** The person
  diagnosing it holds both identities, so their own Microsoft sign-in takes the
  identity-*found* path. A green result there proves the issuer fix and says
  nothing whatever about whether linking works for accounts that have no `azure`
  row — which was the entire question.

**Rule: verify a fix with an account that actually takes the broken path.** Not
the nearest account, not the operator's own, not the one that is easiest to test.

**Corollary on identifiers.** `auth.identities.provider_id` for Azure is the
`sub` claim, not the directory object id — verified against the live rows
(`provider_id = identity_data->>'sub'` for all four, `= oid` for none, length 43
rather than a GUID's 36). Microsoft's `sub` is unique per user *per application*,
so it cannot be looked up in the portal and cannot be known before that app has
received a token for that user. Hand-inserting identity rows is therefore not
risky-but-possible; it is not possible, and a wrong value produces a row that
makes an account *look* linked while nothing works.

---

## 7. When one value has to be declared twice, test that the copies agree

**Rule: if a value cannot be shared, make its drift fail the build.**

`src/` and `supabase/functions/` cannot import from each other. The edge tree is
Deno, both tsconfigs exclude it, and a cross-boundary import would break the
`git archive` the deploy scripts build. So some values genuinely must exist twice,
and "keep these in sync" comments do not keep anything in sync.

Three instances, all cheap to guard:

| value | copies | what drift looks like |
|---|---|---|
| the participant cap | `hotel-training-constants.ts`, `sp-submit-training/index.ts` | a wizard the user can fill and cannot submit — 99 rows of work lost at the last click |
| the report recipients | `training-report/index.ts`, `send-training-report-real.sh`, the design spec | the "REAL SEND" prompt names the wrong people at the exact moment the operator decides |
| `api.max_rows` | `config.toml`, every `.limit()` | silent truncation at 1000 rows (see section 2) |

Each is guarded by a unit test that reads both files and compares
(`participant-cap-agrees`, `report-recipients-agree`, `no-overclamp-limit`). They
are cheap, hermetic, and they fail on the commit that causes the drift rather than
in production weeks later.

Two things that make such a test worth having rather than decorative:

- **Assert the extraction worked.** These tests pull values out with a regex. A
  renamed constant makes the regex match nothing, and "nothing equals nothing"
  passes. Assert each side is a real, usable value *before* comparing —
  `participant-cap-agrees` requires both to be positive integers, which is what
  catches the rename.
- **Guard the messages too, not just the validators.** A validator allowing 100
  while its message reads "Maximum 15" is the same drift in different clothes,
  and the message is the half a user believes. Derive user-facing text from the
  constant and have the test reject literals.

**Do not** test that the value equals a specific number. That is a config value;
a test restating it only ever fails when someone changes it deliberately, which
is noise. Test that the copies agree.

---

## 8. A check that looks defensive may be required — cite the spec, not your instinct

**Rule: an asserted requirement and an invented one are textually identical.
Only a citation tells them apart.**

Two checks in the `$batch` write path read like exactly the over-caution a
clean-code pass exists to strip:

- matching `$batch` responses to requests by `id` instead of by position
- rejecting duplicate `rowNo` values on data the client generates as `index + 1`

Both were written with a confident justification:

```
// Graph does NOT guarantee that responses come back in request order, so
// they must be matched by id.
```
```
// rowNo is now the $batch correlation id, so it MUST be unique: Graph rejects
// a batch containing two requests with the same id ... The client generates
// rowNo as index+1 so this cannot currently happen, but the function must not
// depend on that.
```

Reading Microsoft's JSON batching documentation confirmed both, in those words:
*"Individual responses might appear in a different order than the requests"* and
*"Must be unique in the batch, otherwise the batch request fails with a `400`
error code."* So neither is defensive. They are the contract.

**The part worth keeping.** Those comments were written from memory and were
*right*, but nothing in them said so. A comment asserting a requirement and a
comment inventing one look the same on the page — same confidence, same shape,
no way for the next reader to tell which they are holding. The verification is
what moved them from asserted to documented, and it happened by luck of a later
review rather than by design.

**And the danger is symmetric.** The general rule "do not add guards for cases the
caller contract already excludes" would license deleting the `rowNo` check on
sight: the client really does generate `index + 1`, so a duplicate really is
impossible *today*. Deleting it would have removed a documented API requirement
and left a failure mode where either the whole batch 400s or one row's error is
attributed to a different person. The same uncertainty that got these built could
just as easily have got them deleted.

This is a different shape from section 2. There the check was wrong. Here the
check was right and the *reason recorded for it* was unverified — which is one
review away from the same outcome.

**Rules.**
- When you write a guard, cite the sentence in the spec that requires it, not the
  behaviour you believe. A comment that names its source survives review; one that
  sounds confident invites deletion.
- Before deleting a check as speculative, go and find the contract that governs
  it. *"It looks paranoid"* is not evidence, and neither is *"the current caller
  can't produce that."*

---

## 9. Speculative configurability grows its own supporting artifacts

**Rule: for any option, name the production caller. If the only callers are
tests, delete the option and the tests with it.**

`writeParticipantsInBatches` took an optional `batchSize`. No production caller
passes it — Graph's limit of 20 is the only value that has ever been used. But it
did not sit there inertly:

1. The option exists, so it can be given a wrong value.
2. So a clamp exists — `Math.max(1, Math.min(opts.batchSize ?? LIMIT, LIMIT))`.
3. So a test exists — *"an oversized batchSize is clamped to the Graph limit
   rather than trusted"* — which is the only test that passes `batchSize` at all.

Three artifacts, all passing, each one justified by the one above it, and the
whole cluster resting on zero production callers. Deleting the option deletes the
clamp and the test with it.

**Why it is hard to see.** The test is what makes the parameter look
load-bearing. A green test reads as evidence that the code matters, and coverage
cannot distinguish *"this is needed"* from *"this is exercised"*. Worse, the clamp is
genuine-looking defensive programming, so a reviewer checking for over-caution
finds a guard that is doing real validation — of an input nothing supplies.

**The tell.** Ask *"what breaks if I delete this?"* and follow the answer one more
step. If everything that breaks exists only because of the thing being deleted,
the cluster is dead weight, however green it is.

Related: this is YAGNI, but the ordinary form of YAGNI is one unused thing. The
form worth watching is the one that recruits a guard and a test to look necessary.

## 10. A test suite that never runs the built app cannot see build-only failures

**Rule: whatever assembles the thing users load must itself be under test. If the
suite talks to the dev server, no test in it can fail for a bundling reason.**

`playwright.config.ts` pointed its `webServer` at `npm run dev`. 105 tests, two
browser projects, and not one of them had ever loaded a production bundle.

So when `build.rollupOptions.output.manualChunks` was added, the entire suite was
blind to what it did:

- The built app threw `Cannot access 'P' before initialization` on first paint — a
  cross-chunk circular import. Nothing rendered at all. `vite dev` serves unbundled
  ES modules, so it cannot reproduce this class of failure even in principle.
- The chunking also made first load *worse*. A catch-all `return 'vendor'` swept
  route-only dependencies (recharts, emoji-picker-react) into a chunk the entry
  needed part of, so ~570 kB of lazily-loaded code became eager: 1638 kB where the
  unsplit entry had been 1537 kB. The build printed no warning; both numbers look
  like a large bundle.

Neither was caught by typecheck, by lint, by `test:unit`, or by the full Playwright
suite. All five were green. It was caught by loading the page.

**It reached the live site.** `npm run build` writes to `dist/`, which is the
directory PM2's `serve` reads, so a build run to *inspect* chunk sizes deployed the
broken bundle as a side effect. Recovery was a rebuild from `HEAD`'s config — but
the interval was real, and the lesson is that a build command with a default output
path is a deploy in disguise.

**Two fixes, and the cheap one is the test.**

1. `PW_BUILD=1 npx playwright test` builds to `dist-test/` and serves it with the
   same `serve <dir> -l <port> -s` command line PM2 uses. The same 105 tests then
   cover chunk init order, `public/serve.json` (an invalid one stops `serve`
   booting), and the SPA rewrite. Adding it was ~20 lines of config.
2. Never `npm run build` without `--outDir`. `scripts/deploy-frontend.sh` builds
   from a git archive in a temp directory for this reason.

**The general shape.** Ask what production does that the test environment does not.
Here it was three things — bundling, minification, and static file serving — and
the suite's coverage of all three was zero while reading as comprehensive. A
green suite bounds the failures it can observe, not the failures that exist.

---

## 11. A harness that runs nothing reports the same silence as a harness that passes

**2026-08-03.** A mutation harness for `_shared/colleague-trainers.ts` ran four
mutations and reported all four "caught". It had caught nothing. The command was:

```
node --test "$F.test.ts"       # F=supabase/functions/_shared/colleague-trainers.ts
```

which resolves to `colleague-trainers.ts.test.ts` — a file that does not exist.
`node --test` exited non-zero with no test output, the `grep -E "^ℹ (pass|fail)"`
matched nothing, and the harness printed an empty result for each mutation.

**What made it survivable.** The output was *empty*, not green. Emptiness was read
as a result in its own right and chased. Had the harness compared against an
expected count, or reported "no failures found", every mutation would have been
recorded as caught and the commit message would have said so.

**Why this belongs here rather than in a commit message.** It is the same shape as
§4 and §10: a check that cannot observe the thing it claims to check. The failure
mode is not "the test is wrong" but "the test was never run", and the two look
identical from the outside — both produce no failures.

Three cheap defences, in order of value:

1. **Run the harness unmutated first and assert the baseline.** A pass count that
   is zero, or absent, is a broken harness — not a clean run. This is the one that
   would have caught it immediately, and it is one extra line.
2. **Assert the file exists before starting.** `test -f "$T" || exit 1`.
3. **Never derive a test path from a source path by concatenation.** Name it.

`scripts/rehearse-deploy-frontend.sh` already does (1) — its clean run asserts nine
named properties, so an empty run fails. The ad-hoc harness did not, because it was
ad hoc. **An ad-hoc verification harness needs the baseline assertion more than a
committed one does, not less**, precisely because nobody will look at it twice.

---

## 12. A heuristic's misses look exactly like genuine absences

**2026-08-03.** Mapping six recorded trainer names in `training_sessions` onto their
`ColleagueName` in Colleagues_Master, I wrote a fuzzy SQL join — exact match, or
first-token plus second-token `LIKE`. It resolved five and returned `NULL` for the
sixth, `Ayman Arikat`.

I was one sentence from reporting that **a person who has actually delivered training
has no colleague record** — which would have been a real finding with real
consequences: it is precisely the case that cannot be recorded once trainers come from
Colleagues_Master, so it would have gone into the spec as a known regression.

It was wrong. He is `Ayman Khalil Darwish Erikat`. The surname differs by **one
letter** — Ari­kat / Erikat — so no token-prefix rule could match it, and the correct
row was sitting in the same 336-row payload the whole time.

**The trap is that a fuzzy matcher's output conflates two different facts.** "No match"
means either *not present in the data* or *my rule failed to find it*, and nothing in
the result distinguishes them. The first is a finding; the second is a bug in the
query. Both render as `NULL`.

What caught it was refusing to treat `NULL` as an answer and running a **second probe
with a different failure mode** — `ilike '%ayman%'` and `ilike '%arikat%'` over the
whole payload, which found him on the first pattern immediately. One substring search
per direction, ten seconds.

**The rule.** When a heuristic match reports "not found", that is a **hypothesis**, not
a result. Before writing it down as a fact, probe again with a rule that fails
differently — a substring where the first was token-based, a different field, a wider
net. If the second probe agrees, the absence is real.

**And the corollary this repo already depends on.** This is the concrete reason the
trainer field keys on `employeeId` rather than names, and why the mapping of those six
rows was confirmed by eye rather than computed. The same class of near-miss appears
twice more in the same tenant: `Amir Monir` is `Amir Gerges Daoud`, and the sign-in
alias transform (`ahmed.mokhtar` → `ahmedm`) is consistent but not injective, so
`ahmed.mansour` collides onto the same value. A name matcher here does not merely fail
— it succeeds against the wrong person. See
`docs/superpowers/specs/2026-08-03-trainer-field-is-the-participant-picker-design.md`.

## 13. One anomaly is a sample. Measure the set before calling it a one-off

**Found:** 2026-08-04, while agreeing the `TrainerNames` format contract.

Ahmed ran the trainer-name join by hand and got nine exact matches out of ten. The one
mismatch was `Muhammed Muhammed Zawahir`: Colleagues_Master holds
`"Muhammed Muhammed··Zawahir"` with a double space, and the format contract collapses
runs of whitespace, so the recorded value was right and the comparison was naive.

The obvious next move — the one that was nearly taken — was to fix that row and move on.
It is one character, in one row, with a known cause. Everything about it says *one-off*.

He asked instead whether it should be fixed at source, which turned into "how many rows
are like this?" The answer was not one:

- **five** names with repeated whitespace, out of 336;
- **two** positions, one leading-space and one internal, in fields nobody had looked at;
- one of the five, `Abdelfattah Abdelwahed··Ghallab`, an **active trainer** — so this was
  not a latent participant-only problem;
- a **live broken search**: Sera matches participants with
  `(p.colleague_name ?? '').toLowerCase().includes(needle)`, so a needle typed with one
  space cannot match a stored double space. Five colleagues were unfindable, silently,
  and had been for as long as the rows existed;
- and a **write path that keeps producing them**: `sp-manage-colleague` validated a field
  with `.trim()` and then wrote the RAW value one line later, so the Manage Members tab
  was itself the source. Not hand-editing in SharePoint, which was the assumption —
  our own form.

None of that is visible from the single row. The row shows a typo; the set shows a defect
with a mechanism, a live symptom, and a supply.

**The rule.** When one anomaly turns up in a dataset, the cheap question is not "what
caused this one?" but **"how many are there, and in which fields?"** One `group by` or one
`~ '\s\s'` scan across the whole set, before deciding anything. It costs a query and it
decides whether you are looking at an incident or a class — and those get different fixes.

**The trap that makes this feel unnecessary.** A single instance always has a satisfying
explanation, because you go and find one. "A double space, someone pasted it" is true,
complete, and sufficient — and it accounts for exactly one row while quietly implying the
others don't exist. A plausible cause for the sample is not evidence about the population.
This is the same shape as §12 (a heuristic's miss reads as an absence) and §11 (silence
reads as success): in all three the wrong conclusion is the *comfortable* one, and the
correction is one deliberate extra measurement.

**And the corollary about fixing data.** Cleaning the six rows without fixing the write
path would have emptied the current set while leaving the mechanism, converting a
five-example reproducible pattern into a future single mystery — strictly harder to
diagnose than what we started with. Fix the entry point in the same change as the data,
or the next occurrence arrives with no pattern attached.
