# Trainer picker: staff list + full-directory escape hatch

> **SUPERSEDED and WITHDRAWN** — see
> [`2026-08-03-trainer-field-is-the-participant-picker-design.md`](2026-08-03-trainer-field-is-the-participant-picker-design.md).
>
> This was built (`904779f`..`aa16231`) and deployed on 2026-08-03, then withdrawn
> unbuilt-upon. It solved the wrong problem: it gave the picker *reach* into the
> Microsoft directory, when the actual requirement was that **any colleague** can be a
> trainer — including the majority who have no account for a directory to contain. The
> trainer field is now plain text sourced from Colleagues_Master.
>
> Its one good idea was kept: explain why a person cannot be recorded *before* the form
> is filled, never at submit.
>
> The code is removed in commit 6 of the superseding spec: `sp-search-directory`,
> `_shared/directory.ts`, `_shared/sharepoint-rest.ts`, and the picker's directory UI.

Design agreed 2026-08-03. Supersedes the data-source decision in `4b1079b`, whose
commit message names both reasons the dropdown moved to the User Information List
(UIL). This addresses both.

## The problem

The PowerApp (`Monthly_Training`) was changed and published on 2026-08-03 to search
the whole Microsoft 365 directory via `Office365Users.SearchUser`. This website's
trainer picker reads the SharePoint site's UIL instead — 12 real users — so the two
now disagree about who is a valid trainer.

The operator wants the website to reach the directory too. The hard constraint:

> Graph can only write a Person column by **UIL LookupId**
> (`TrainerName_x002e_LookupId`). There is no write-by-email. A directory user who
> has never touched the site has no id, so they cannot be recorded — not because of
> a filter we chose, but because there is nothing to write.

Getting an id for an arbitrary user means SharePoint's own
`_api/web/ensureuser`, which needs a **SharePoint** application permission (not a
Graph one) plus tenant admin consent. That consent is expected next month. **This
design must be useful before it lands**, because the next four weeks are exactly
the window in which someone hits a missing name.

## What the operator asked for

The filtered staff list as the default. If the person is missing, type the name,
the field reaches wider, offers real directory accounts, they pick one and carry
on. Not free text — reach. Two sub-cases to handle:

- **A.** In the UIL but filtered out by the staff heuristic. Submittable today.
- **B.** Never in the site. Not submittable until ensureuser works. The UI must say
  so plainly *before* the rest of the form is filled in, not at submit.

## Finding that reshapes the work

**Sub-case A needs no search at all.** The staff list is
*(directory filtered by jobTitle/department)* ∪ *(the entire UIL)*. Anyone in the
site with a blank directory record is therefore already in the normal list and is
found by the existing local filter. The union is not an optimisation here — it is
what makes sub-case A disappear.

So the escape hatch is **only** about sub-case B. Today its job is to *find and
explain*, not to enable. It becomes enabling on the day consent lands, with no
further frontend work.

**Sub-case B is exactly detectable, before submit.** `sp-search-directory` reports
`inSite` per result, checked against the UIL on the server. No guessing, no
heuristic, no submit-time surprise. (The tempting client-side inference — "absent
from the loaded staff list ⇒ absent from the UIL" — is sound only if that list is
current, and Phase 2 serves it from a mirror up to 60 minutes stale. That would
produce false "cannot be recorded" verdicts for people who in fact can be. Rejected
for that reason.)

## Architecture

```
                 ┌─ sp-read-trainers ────────────────────────────┐
  page load ───► │  Graph /users  (staff filter)  ∪  site UIL    │ ──► staff list
                 │  cached 15 min · mirrored (Phase 2)           │     inSite per entry
                 └───────────────────────────────────────────────┘

                 ┌─ sp-search-directory  (NEW) ──────────────────┐
  explicit  ───► │  Graph /users?$search=…  +  UIL membership     │ ──► wider matches
  click          │  uncached, ≤25 results                        │     inSite per entry
                 └───────────────────────────────────────────────┘

                 ┌─ sp-submit-training ──────────────────────────┐
  submit    ───► │  resolve via UIL (unchanged, cached)          │
                 │  unresolved → _api/web/ensureuser → LookupId   │
                 │  no SharePoint token → today's 400 verbatim    │
                 └───────────────────────────────────────────────┘
```

### Why a new endpoint, not a `?search=` parameter

`sp-read-trainers` is the hot path: a 15-minute in-memory cache in a single slot,
and the Phase 2 mirror under key `'trainers'`. A search response on that path would
either overwrite the full-list cache, or pollute the mirror row, or need unbounded
per-query mirror keys. Search has the opposite cache profile — per-query, short,
not worth persisting. Keeping them apart leaves the perf work from Phases 1.4 and 2
untouched, which is worth more than one fewer function.

Cost: cold start (~2–3 s) on a rarely-invoked function. Acceptable behind a
deliberate click with a spinner, and it never touches the page-load path.

### Read path — `sp-read-trainers`

```
GET /users?$select=id,displayName,mail,userPrincipalName,accountEnabled,jobTitle,department&$top=999
```
paged to exhaustion. Drop `accountEnabled === false`, and anything without a
display name or a mail/UPN.

**Staff filter:** keep entries with a non-empty `jobTitle` **or** `department`.
This is a heuristic and it is the one accepted risk: a real colleague with an
incomplete directory record is excluded. The UIL union bounds that risk to people
who have never used the site.

**Union with the UIL:** reuse the existing UIL walk. Entries from the UIL are
marked `inSite: true`; directory-only entries `inSite: false`. Dedupe by lowercased
email, UIL winning (it carries the fact that matters). Sort by display name.

Response shape gains one field, so `TrainerRef` becomes
`{ displayName, email, inSite? }`. Optional, so existing drafts and the
`FALLBACK_TRAINERS` constant stay valid without migration.

### Search path — `sp-search-directory` (new)

Body `{ q: string }`, minimum 2 characters after trimming.

```
GET /users?$search="displayName:<q>" OR "mail:<q>"
           &$select=displayName,mail,userPrincipalName,accountEnabled,jobTitle,department
           &$top=25
ConsistencyLevel: eventual
```

Verified against Microsoft's docs (`learn.microsoft.com/en-us/graph/search-query-parameter`),
which give `../users?$search="displayName:Guthr" OR "mail:Guthr"` as the example
for users and state that `ConsistencyLevel: eventual` is required for directory
objects. Per the same page, matching is **tokenised, not substring**: input and
property are split on spaces, case changes and symbols, then tokens are matched in
any order. So `moh` finds the token `Mohammad`, but `hammad` does not. The empty
state must say this, or users will conclude the person does not exist.

Quote and backslash in `q` are escaped per the documented clause syntax; everything
else is URL-encoded. `q` is never interpolated into the URL unescaped.

Each result carries `inSite`, from the same UIL walk the read path uses. No staff
filter here — reaching past the filter is the entire point.

### Write path — `sp-submit-training`

Unchanged UIL resolution first. For each unresolved trainer:

```
POST https://2seasonshotels.sharepoint.com/sites/Two_Seasons_Training_Record/_api/web/ensureuser
     Accept: application/json;odata=nometadata
     { "logonName": "i:0#.f|membership|<email>" }        → { "Id": <lookupId>, … }
```

with a token for `https://2seasonshotels.sharepoint.com/.default` — `_api` rejects
Graph tokens. New ids go into the existing `lookupIdCache`.

**Degradation is the point.** If the SharePoint token cannot be obtained (no
permission granted yet), the function returns **today's 400, verbatim**. Nothing
regresses, and the feature switches on the day consent lands with no redeploy of
the frontend. If ensureuser is reachable but fails, the submission fails with a
message naming the trainer and distinguishing "permission not configured" from
"no such account". Never a silent drop, never a partial write.

## UI

The trainer picker keeps the staff list as its only default content. Once the query
is ≥2 characters, one extra row appears at the bottom of the list:

```
  Search the full Microsoft directory for "moh"
```

**Explicit, but auto-surfaced.** A click, not a keystroke: no Graph call per
character, and a service account can never appear by accident — the operator's
stated reason for preferring explicit. Auto-surfaced so it is discoverable exactly
when needed rather than being a feature to remember.

Results land in a second, labelled group:

```
  TRAINER LIST
    Ahmed Mokhtar Elsayed Elaktaa
    Amir Monir Aziz

  FROM THE FULL MICROSOFT DIRECTORY
    Ibrahim Mohammad          Chef de Partie
    Mohammed Rashid           ⚠ not on the Training Record site yet
```

Entries with `inSite: false` are **not selectable**. Selectable-but-warned puts the
user back at a failure after filling the form, which is what this design exists to
prevent. Attempting one shows, in place:

> **Mohammed Rashid can't be recorded yet.** They have never opened the Training
> Record SharePoint site, so SharePoint has no id to file the training against.
> Either ask them to open the site once, or record one training for them in the
> Monthly_Training PowerApp — both take a minute and they will appear here within
> 15 minutes.

Both remedies work **today**, without waiting for consent. The PowerApp one exists
because the app now writes Person values from the directory, and SharePoint
materialises the user as it does so.

Empty state, when the wider search finds nothing:

> No Microsoft account matches "xyz". Search matches whole words from their start,
> so try a first or last name rather than part of one. Someone with no mailbox
> cannot be recorded as a trainer at all — the SharePoint column requires a real
> account.

The two existing helper lines under the field are replaced by this flow.

## Testing

Pure, in `node --test` (no Deno, no network — the `participant-batch.ts` pattern):

- **Staff filter:** jobTitle only → kept; department only → kept; both blank and
  `inSite` → kept; both blank and not in site → dropped; `accountEnabled: false` →
  dropped; no mail → dropped; falls back to `userPrincipalName` when `mail` is null.
- **Union/dedupe:** same email from both sources yields one entry with
  `inSite: true`; case-insensitive on email; sorted by display name.
- **Search clause builder:** exact documented shape; `"` and `\` escaped; `<2`
  chars rejected; the built string is asserted against the literal from the docs.
- **Claims builder:** `i:0#.f|membership|<lowercased email>`; rejects empty.

E2E (Playwright, mocked at the HTTP boundary):

- The staff list still renders and is still usable with no network (the Phase 1.1
  guard test must keep passing).
- The "search the full directory" row appears at 2 characters and not at 1.
- A wider result with `inSite: true` is selectable and reaches the submit payload.
- A wider result with `inSite: false` is not selectable and shows the reason.
- Empty wider search shows the empty state, not "No trainer found."

**Cannot be tested here, and must be stated in the commit:** ensureuser itself.
No Azure credentials in this environment and it needs the real tenant. The first
real submission naming a directory-only trainer is the only proof — the same
standing debt as `$batch`.

## Sequencing

Build and commit now. **Do not deploy `sp-submit-training`** until one real training
has submitted successfully, so `$batch` stays the only unproven thing in that
function — the B5 argument, unchanged. `sp-read-trainers` and `sp-search-directory`
carry no such debt and can go whenever.

Operator steps, in order:

1. Submit one real training on the current live code. Proves `$batch`.
2. `bash scripts/deploy-sp-function.sh --all` (now including `sp-search-directory`)
   plus `bash scripts/deploy-frontend.sh`.
3. When SharePoint consent lands, redeploy `sp-submit-training` and re-test with a
   directory-only trainer.

The Azure permission is one more piece of un-versioned config, so it is recorded in
CLAUDE.md's Auth section and in B3.
