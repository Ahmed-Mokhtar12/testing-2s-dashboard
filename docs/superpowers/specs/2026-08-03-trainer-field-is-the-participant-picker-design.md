# The Trainer field becomes the Participant picker

**Date:** 2026-08-03 · **Status:** approved, in progress
**Supersedes:** `2026-08-03-trainer-field-from-colleagues-master-design.md`
(which itself superseded `2026-08-03-trainer-directory-escape-hatch-design.md`)

## Requirement

The Trainer field becomes the same thing as the Participant field:

- **Same source** — Colleagues_Master, active colleagues only.
- **Same picker**, same look, same search behaviour: searchable by name **or** employee
  ID.
- **Same storage shape** — plain text names, exactly as participants are stored. No
  account, no email, no LookupId, no Person column.
- **Only difference** — multiple trainers may be selected, where a participant row
  holds one.
- **Mutual exclusion both ways** — a colleague selected as a trainer cannot also be
  selected as an attending participant, and vice versa, in both orders, reconciled
  sensibly when a saved draft is loaded.

**Any colleague in the list can be a trainer. Nothing about their Microsoft account is
relevant.** A housekeeping attendant with no email can deliver a session and must be
recordable.

## Progress

`git log --oneline` plus this table answers "where are we".

**A commit cannot contain its own SHA** — recording it changes it. So each commit marks
its own row `done` and fills in the SHA of the row **above** it. Row N's hash therefore
lands in commit N+1, and the last row's lands in whatever touches this file next.

| # | Commit | Deploys | SHA | State |
|---|---|---|---|---|
| 1 | `docs(spec)` this document | — | `77f7c9f` | done |
| 2 | `fix(report)` normalise all six trainer names | SQL only | `6d0fd21` | done |
| 3 | `feat(trainers)` edge accepts trainer names | sp-submit-training | `63e15a8` | done, NOT deployed |
| 4 | `test` dedicated trainer fixture colleague | — | `4ee0045` | done |
| 5 | `refactor` one colleague search rule | — | `9436dc0` | done |
| 6 | `revert` the escape hatch | delete sp-search-directory | `c357ef2` | done; platform delete DONE 2026-08-03 |
| 7 | `feat(hotel-training)` the field itself | **frontend** — operator present | | |
| 8 | `chore(trainers)` delete the LookupId path | sp-submit-training, sp-read-colleagues | | |

Commits 1–6 are safe to land in any order relative to the PowerApp decision; see
§"One check before the frontend deploy".

## What this withdraws

Dropped entirely: the directory escape hatch and `sp-search-directory`, the
UIL-sourced dropdown, the staff heuristic, `ensureuser` and the pending SharePoint
consent as a dependency, the `ColleagueAccount` gate, `hasAccount`, and the "linked
account required" refusal.

`ColleagueAccount` **stays as a SharePoint column** — the 17 rows already linked cost
nothing, and churning the list again buys nothing.

## Why the Person column was never the right target

- `training_sessions.trainer_names text[]` in Postgres is what the monthly report
  ([training-report/index.ts:85](../../../supabase/functions/training-report/index.ts))
  and Sera
  ([chat-with-data/training-aggregator.ts](../../../supabase/functions/chat-with-data/training-aggregator.ts))
  actually read. SharePoint's `TrainerName_x002e_` Person column **has no reader in
  this system** — `sp-submit-training` writes it and nothing reads it back.
- It was never a product decision. The original design
  ([2026-06-10](2026-06-10-hotel-training-design.md)) recorded the column as *Choice
  (multi-select)*; a live probe on 2026-07-27 found a multi-select People Picker and
  the app adapted the same day. **This is a correction, not a reversal.**
- Confirmed 2026-08-03: the column offers no "Change column type" option at all — it
  renders as static text over an underlying `UserMulti`. **Conversion is impossible in
  the UI. Adding a new column was the only path.**

Two findings from the withdrawn attempts are preserved here because they are the
reasons nobody should revive name matching or `ensureuser`:

1. **Name matching is refuted by this tenant's data.** "Amir Monir" (his account's
   display name) is **"Amir Gerges Daoud"** in Colleagues_Master — EmployeeID 102387,
   Assistant HR Manager. One person, two names, sharing only the token "Amir".
2. **A login cannot be derived from an address.** The tenant signs in with a short UPN:
   `ahmed.mokhtar@` → `ahmedm@`, `Amir.Monir@` → `amirm@`, `xarmaigne.narciso@` →
   `xarmaignen@`. The pattern is consistent and still unusable, because it is not
   injective — `ahmed.mokhtar` and `ahmed.mansour` both yield `ahmedm`, and a collision
   resolves to a different real person, silently.

## The SharePoint column — created and probed

Created 2026-08-03: internal name **`TrainerNames`**, display name `TrainerNames`
(deliberately not "Trainer Names", so there is no ambiguity with the existing "Trainer
Name"), type **Text (single line)**, `Required` false, default null, in the default
view.

Probe output, 33 columns on the list:

```
internal name : TrainerNames
display name  : TrainerNames
type          : text                     <- the 255-char cap governs the write

internal name : TrainerName_x002e_
display name  : Trainer Name
WRITE/READ AS : TrainerName_x002e_LookupId
multi-select  : True   chooseFromType: peopleOnly
hidden=False readOnly=False required=False
```

Internal names, for reference: `Title`, `LinkTitle` (Training Title), `field_1`
(Department, choice), `field_4` (Training Duration, number, **required**), `field_5`
(Location, text), `field_6` (Total Participants, number), `field_7` (Remarks, text),
`field_8` (Date, dateTime), `TrainingID` (text), `TrainerName_x002e_` (personOrGroup),
`TrainerNames` (text).

`TrainerName_x002e_ Required = False`, so nothing 400s when the app stops writing it —
no SharePoint change is needed. `field_4` is the second required field on this list;
the app writes it on every submission (`durationMinutes`), so it is safe. Recorded here
so both live together rather than being rediscovered one deploy at a time.

## THE FORMAT CONTRACT — what any writer must put in `TrainerNames`

This is the interface between the web app, the PowerApp, and a hand-typed backfill. A
row written by any of them must be indistinguishable from the others.

```
TrainerNames = names.join('; ')
```

- **Separator: a semicolon followed by exactly one space** — `"; "`.
- **No trailing separator**, no leading or trailing whitespace on the whole value and
  none on any individual name.
- **Selection order preserved** — not alphabetical. The order is what the person chose.
- Each name is the colleague's **`ColleagueName`** from Colleagues_Master, with
  **runs of whitespace collapsed to a single space and the result trimmed** — and
  otherwise unaltered. `Muhammed Muhammed··Zawahir` (a real row, double space) is
  written as `Muhammed Muhammed Zawahir`.
- Case-insensitive dedupe, keeping the **first** spelling encountered.

**Why not truly verbatim.** Colleagues_Master carries its own whitespace dirt — that
double space, and a position of `" IT Manager"` with a leading space. Verbatim would
propagate invisible characters into two stores, and the report's dedupe
(`raw.trim().toLowerCase()`) treats `"A  B"` and `"A B"` as two different trainers. One
stray edit in SharePoint would then silently split a person in the report. Collapsing is
the smallest rule that makes the value stable. **The PowerApp must collapse too**, or
the two writers produce values that differ by an invisible character.

Examples:

```
one trainer    ->  Amir Gerges Daoud
two trainers   ->  Amir Gerges Daoud; Aiman Radwan
three          ->  Amir Gerges Daoud; Aiman Radwan; Muhammed Zawahir
```

**Why semicolon and not comma.** A comma can legitimately appear inside a person's
name; a semicolon effectively cannot. `"; "` is also how SharePoint itself renders
multi-value Person fields, so a `TrainerNames` value reads natively in the list view
and a backfilled row looks like a new one.

**There is no parser.** Nothing in this system reads `TrainerNames` back — the value
exists for SharePoint views, the PowerApp, and humans. It is a *formatting* contract,
not a round-trip one. That is why the format must be agreed rather than inferred: no
code would catch a divergence.

**Length.** The column is `text`, so 255 characters. The write refuses beyond that
rather than letting SharePoint truncate silently, and names the trainer count and the
limit. A `MAX_TRAINER_COUNT` guard bounds a hostile body independently.

## What commit 6 could NOT remove, and why

The plan had commit 6 delete `_shared/directory.ts` alongside `sp-search-directory`
while explicitly keeping `_shared/uil.ts`, `_shared/sharepoint-rest.ts` and
`sp-read-trainers`. Those three **import** `directory.ts` — `uil.ts` takes
`TrainerEntry`, `sharepoint-rest.ts` takes `membershipClaim`, and `sp-read-trainers`
takes most of it. So that pairing was impossible; the plan was wrong, not the code.

Deferred to commit 8, where the legacy submit path goes and all of them die together:

| Deferred from commit 6 | Why it could not go there |
|---|---|
| `_shared/directory.ts` + `directory.test.ts` (11 tests) | imported by the three below |
| `_shared/uil.ts` | takes `TrainerEntry` from it |
| `_shared/uil-mapper.ts` + `tests/unit/uil-mapper.test.ts` (5 tests) | imported by `uil.ts` |
| `_shared/sharepoint-rest.ts` | takes `membershipClaim` from it |
| `sp-read-trainers/` | takes most of it |

**So commit 8 is larger than the plan says**, by roughly five modules and 16 unit
tests, and its report must say so plainly rather than let the diff size surprise a
reviewer. Until then `directory.ts` keeps a now-unused `MIN_SEARCH_LENGTH` and a comment
naming the deleted function — dead but harmless, and removing it early would have meant
touching the path that is still live.

## The Person column and the historical rows

**Leave it, freeze it, backfill by hand.**

- **Leave** — it stays on the list, keeps its values, is never dropped. Nothing in this
  system reads it.
- **Freeze** — the app stops writing it entirely. Explicitly **not** "written when the
  trainer happens to have an account": a session with one account-holder and one
  housekeeper would then show one trainer out of two, which is worse than blank.
- **Backfill** — **four rows** (`sharepoint_id` 22, 23, 25, 26), typed by hand in the
  list, in the format above. No script, no dry-run, no idempotency logic. This is also
  why `_shared/uil.ts` and `uil-mapper.ts` need not survive commit 8: they were only
  being kept alive to map LookupIds to display names for a backfill that no longer needs
  code. Five until "Housekeeping" was deleted; it is now every row on the list.

**Backfill AFTER the frontend deploy and after the first new-path submission, not
before.** The order looks arbitrary — the four rows are historical and the deploy only
affects new ones — but it decides what the hand-typing is checked against. There is no
parser and no test that reads `TrainerNames`, so the *only* verification this format
ever gets is a human eye comparing one value to another. Backfilling last means the
comparison is against a machine-written row that exists: type the four to match it,
byte for byte, and any divergence in separator or whitespace is visible in the list view
with both kinds of row on screen together. Backfilling first inverts it — the values get
compared against a sentence in this document, and if the writer and the typist disagree
about `"; "` the four rows are already wrong and have to be retyped. It also keeps the
deploy window free of unrelated data entry.

## Design decisions

**Wire shape: the client sends trainer names as text**, exactly as it sends participant
names. The deciding argument is not "less code" — it is that `trainer_names` in
Postgres is written by the **client**
([useTrainingSubmit.ts:126](../../../src/hooks/useTrainingSubmit.ts)). If the edge
function resolved authoritative names for SharePoint while the client independently
wrote its own array to Postgres, the two would disagree in exactly the case server
resolution exists to prevent — and the report reads the client's copy. One fact, one
writer. `useTrainingSubmit` computes the array **once into a local** and uses that same
local for both destinations.

**New body field `trainerColleagueNames`. `trainerNames` must not be reused** — it
already exists with incompatible semantics (`normalizeTrainers` 400s anything that is
not a key of `TRAINER_EMAILS`). Redefining it would silently route a legacy client's
trainers into the new column, which is precisely what accepting both shapes exists to
prevent. Precedence, never merge: `trainerColleagueNames` → `trainerEmployeeIds` →
legacy `trainers`/`trainerNames`.

**In memory and in drafts, trainers are `Colleague[]`** — the same type a participant
row holds. Plain text is the wire and Postgres shape only. Exclusion must key on
`employeeId`: names are not unique in Colleagues_Master (a re-hired colleague can hold
two rows), and keying on names is the unreliable join this whole effort exists to
refute.

**Exclusion state is derived, not stored.** In `HotelTraining.tsx` the participant side
reads `trainingDetails.trainers` — the **committed** value, never the per-keystroke
`draftTrainingDetails`, because that mirror is explicitly reversible (the
reduce-confirm Cancel path discards it) and a half-typed, abandoned trainer edit must
not empty a filled participant row. The trainer side reads `participants`. Conflicts
are **prevented** at both pickers; a residual conflict fails visibly in
`ParticipantsStep.handleNext` rather than silently blanking a row.

**Component split — extract two things, write the third.** A shared
`mode: 'single' | 'multi'` picker is the abstraction that accretes `if (mode === …)`
branches (see `docs/testing-lessons.md` §9), and `ParticipantRow` is a *row*, not a
picker — rowNo gutter, three metadata badges, clear button.

- `src/lib/colleague-search.ts` — `filterColleagues(colleagues, query, { exclude, keep })`,
  replacing `ParticipantRow`'s inline `available` computation and
  `src/lib/trainer-search.ts`. This is the piece where drift would be a real defect,
  since "same search behaviour" is a stated requirement. The employee-ID match becomes
  case-insensitive (today it is a case-sensitive substring).
- `ColleagueOptionLabel.tsx` — the six-line option body, so "same look" stays true.
- `TrainerPicker.tsx` — a separate multi-select mirroring the markup, with
  `data-testid="trainer-select"`, and the placeholder `Select trainers...` kept
  byte-identical so the existing e2e open-click needs no edit.

**Draft rules.** `reconcileDraft` (new, pure, in `src/lib/hotel-training-draft.ts`)
replaces `migrateLegacyTrainerDraft`. It does not mutate its input and **takes no
colleague list**. Per entry: the new shape (`employeeId` + `colleagueName`) is kept
verbatim; a legacy `{displayName,email}` is dropped; a bare string is dropped;
anything unreadable is dropped; the retired structural `trainer*` key is dropped. The
notice names who was removed and asks for a re-pick.

Overlap — the same colleague as trainer and participant — **the trainer wins, the
participant row is cleared to `null`, and the row number is named.** Restore always
lands on step 1 where the trainer badge is on screen; zod requires ≥1 trainer, so
clearing the trainer instead would block Next; and an empty row is self-announcing
where a removed trainer announces nothing. **Clear, never splice** —
`participants.length` must stay equal to `totalParticipants`. Surfaced as a persistent
dismissible Alert, not a toast, cleared by `applyStep1`.

## One check before the frontend deploy — ANSWERED, and it is clear

**Does the PowerApp, a Power Automate flow, or a SharePoint view/formatting rule depend
on `TrainerName_x002e_` being populated on NEW rows?** If any does, new rows look blank
there. This is volume-independent and outside this repo, so it had to be answered before
commit 7's frontend deploy — the first moment such a row exists. Commit 3 changes
nothing observable in SharePoint.

**Checked by the operator, 2026-08-03: nothing depends on it.** No Power Automate flow
reads it, no SharePoint view or filter uses it, and the PowerApp does not surface it on
any screen. An empty Person column on new rows breaks nothing. **T-C is closed** and
commit 7 is unblocked.

This is the answer that makes "freeze the column" safe rather than merely tolerable. Had
any consumer existed, the choice would have been between a half-populated Person column
(one trainer of two, when only one has an account) and a visibly broken downstream view
— and both are worse than blank.

For the PowerApp specifically, if it remains a submission path it needs two changes:
write `TrainerNames` per the format contract above, and source its trainer list from
Colleagues_Master rather than `Office365Users.SearchUser` — otherwise the two doors
offer different populations of trainers and the requirement holds in only one of them.

## The reporting picture, corrected

### WITHDRAWN: the "~20 missing sessions" inference

An earlier analysis inferred from SharePoint item ids (`20, 21, 22, 23, 25, 26`) that
≥20 sessions had been created by another writer and never reached Postgres, putting the
report at ~23% coverage. **That is wrong and must not be quoted.**

Sequential item ids prove items were *ever created*, never that they *exist*. The
analysis noted that caveat and then reasoned past it — the caveat turned out to be the
entire explanation. **Items 1–19 and 24 are deleted test data.**

### The measured position, 2026-08-03

| Source | Count |
|---|---|
| Monthly_Training items, total | **4** |
| — `Created By` = "SharePoint App" | 4 — **all of them, ours.** `sp-submit-training` authenticates app-only, so its rows are attributed to the app rather than a person (`sharepoint_id` 22, 23, 25, 26) |
| — `Created By` = operator's account | **0** |
| `training_sessions` rows | 6, one submitter, all `synced`, `training_sync_queue` empty |

"SharePoint App" was never a second writer. **No fleet of PowerApp sessions exists,
and no row on this list was written by any door but ours.**

The count was 5 when first measured. The fifth, "Housekeeping", was created through the
SharePoint UI by the operator and **deleted on 2026-08-03** once identified as a probe
rather than a session: it carried 13+ trainers against `Total Participants = 2`, a shape
no submission path can produce. So the one item not attributable to
`sp-submit-training` was not a rival writer either — it was us, holding a different tool.

### The real finding, parked

The two stores leak in **one** direction, at tiny volume:

- `sharepoint_id` **20 ("aa") and 21 ("rrr")** are in Postgres but no longer in the
  list — so the report counts two sessions that do not exist in SharePoint, and
  `sharepoint_id` is not a reliable key.
- **Every list item is in Postgres.** There is no session that the report and Sera
  cannot see. This is set arithmetic over the two measured sets — `{22, 23, 25, 26}` in
  the list against `{20, 21, 22, 23, 25, 26}` in `training_sessions` — not a fresh join,
  and it holds only while `sharepoint_id` means what it appears to mean. Re-measure both
  sides before acting on it.

An earlier draft of this section called the leak bidirectional on the strength of
"Housekeeping" being in the list and not in Postgres. With that row identified as a
hand-made probe and deleted, the second direction is gone — and the direction that
remains is the *less* damaging one. The report can over-count; it cannot go blind. That
asymmetry matters to whoever picks this up: the fix is a reconciliation pass that can
mark a Postgres row as orphaned, not a SharePoint-side enumeration to discover sessions
nobody knew about.

**Not investigated here, by decision.** Taken after the trainer field ships.

### In scope: the duplicate-name defect

`trainer_names` recorded **one person under two spellings** — `Ahmed Mokhtar` and
`Ahmed Mokhtar Elsayed Elaktaa`. The report dedupes with `raw.trim().toLowerCase()`,
which cannot collapse those, so `distinct_trainers` reported 6 where the truth is 5.

**Commit 2 found the problem was five times larger and fixed all of it.** Matching every
recorded name against the colleagues mirror showed that only ONE of six matched its
`ColleagueName`:

| recorded | `ColleagueName` | employeeId |
|---|---|---|
| Ahmed Mokhtar | Ahmed Mokhtar Elsayed Elaktaa | 101000 |
| Ahmed Mokhtar Elsayed Elaktaa | (already exact) | 101000 |
| Aiman Radwan | Aiman **Ibrahim Aly** Radwan | 101195 |
| Ayham Hammodi | Ayham **Mooner** Hammodi | 102461 |
| Ayman Ari­kat | Ayman Khalil Darwish **Erikat** | 100074 |
| Muhammed Zawahir | Muhammed Muhammed·· Zawahir (double space) | 101710 |

So fixing only Ahmed would have left a **second wave**: once the field writes
`ColleagueName`, the other four start being recorded under different strings than their
existing rows, and every report spanning the cutover counts each of them twice. All six
were normalised to the whitespace-collapsed `ColleagueName` — the exact bytes the app
will write — so pre- and post-cutover values match.

**The mapping was confirmed by inspection, not computed.** `Ayman Arikat` →
`Ayman Khalil Darwish Erikat` differs in the surname's first letter; a heuristic join
missed him entirely on the first attempt and nearly recorded him as having no colleague
row. Algorithmic name matching is what this spec refutes, so six rows were mapped by eye
and confirmed by the operator, corroborated by department (that session is Revenue;
100074 is Director of Revenue & Sales).

`report_runs` holds no rows, so **no report has ever been sent** — the inflated count
never reached a recipient.

## Known regression, accepted

**Step 1 stops being completable with zero network.**
`tests/hotel-training.spec.ts` holds all three SharePoint reads open for 15 s and
proves step 1 is still usable — which works because `useTrainers` supplies
`placeholderData: FALLBACK_TRAINERS`. `useColleagues` has no placeholder and **cannot**
have one: a placeholder colleague list is a list of people who do not exist. Once the
trainer list *is* the colleague list, and zod requires ≥1 trainer, the user is
genuinely blocked until the colleague read answers.

This is a consequence of the requirement, not a defect, and it is a real regression
against `docs/perf/hotel-training-baseline.md` (3.5–3.8 s typical, 15.7 s once).
Obligations: that test asserts the new truth (the department select is still usable and
the trainer popover says **"Loading colleagues…"**, not "No active colleague found");
`TrainerPicker` carries a loading state; and the mirror serves colleagues in ~100 ms in
the common case, so the exposure is a cold or stale mirror rather than every load.

## Verification

- **Unit**: `colleague-search.test.ts` (active-only; name and ID substrings both
  case-insensitive; `exclude`; `keep` beats `exclude`); `trainer-names.test.ts` (every
  fail-closed case, dedupe, order preservation, the `'; '` join, the 255 cap);
  `hotel-training-draft.test.ts` (each drop class, the notice text, the overlap rule).
- **E2E, the four exclusion cases**: trainer → absent from every participant dropdown;
  participant → absent from the trainer dropdown; deselect a trainer → available again
  as a participant; a draft with the same person on both sides → reconciled, notice
  shown, form still submittable.
- **The picker test that matters**: the trainer dropdown offers **every active
  colleague**, including one with no account and one whose name bears no relationship to
  any account, and excludes the inactive one. This is the test that would have caught
  the `ColleagueAccount` gate.
- **Mutation checks, run and recorded in each commit message**: drop the trainer set
  from the participant exclusion → case 1 fails; drop the participant set from the
  trainer picker → case 2 fails; keep legacy `TrainerRef`s in `reconcileDraft` → the
  notice test fails; make the overlap clear the trainer instead of the row → the overlap
  test fails.
- **Test counts before and after commits 6 and 8**, both of which shrink the suites. A
  green suite that got smaller is `docs/testing-lessons.md` §11.
- **Live**: one real submission after commit 3's deploy (proving both shapes still work
  and `TrainerName_x002e_` is still populated), one after commit 7's (the only proof the
  `TrainerNames` write works), one after commit 8's.
