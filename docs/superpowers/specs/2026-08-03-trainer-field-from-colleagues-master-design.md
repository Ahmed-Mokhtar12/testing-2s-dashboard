# Trainer field sourced from Colleagues_Master

**Date:** 2026-08-03 · **Status:** design, awaiting review · **Supersedes:**
`2026-08-03-trainer-directory-escape-hatch-design.md`

The trainer field becomes the same picker the participant rows use, over the same
list, with mutual exclusion between the two. One source of names, no directory
search, no heuristics.

## What this replaces

The directory escape hatch (`904779f`..`aa16231`) is withdrawn. `aa16231` — which
makes it reachable — stays committed and undeployed. The version live since
16:10 on 2026-08-03 keeps working until this replaces it; nothing needs reverting
for correctness.

Its good idea is kept: **explain why a person cannot be recorded before the form
is filled, not at submit.** Applied here to a source we can trust.

## The LookupId question, answered

A `Colleagues_Master` row could not become a LookupId. It can now, because the
list carries a **Person** column, `ColleagueAccount`, populated for all three
current trainers (confirmed 2026-08-03).

Why nothing else worked, recorded so it is not revisited:

| Path | Why not |
|---|---|
| Match `ColleagueName` against UIL `Title` | Refuted by data on the first row tried. "Amir Monir" in `FALLBACK_TRAINERS` is **"Amir Gerges Daoud"** in Colleagues_Master (EmployeeID 102387, Assistant HR Manager), account `amir.monir@`. Three representations of one person, no shared token beyond "Amir". No matcher — exact or fuzzy — gets this right, and the failure mode is a training filed against the wrong person, which nothing surfaces. |
| Construct the email from a naming convention | `amir.monir@` is not derivable from "Amir Gerges Daoud" by any rule. Independently refuted by the login findings below. |
| Text email column | Reintroduces "email exists but is not in the UIL", which needs `ensureuser` and the SharePoint consent that is still not granted. |
| **Person column (`ColleagueAccount`)** | Graph returns the UIL item id directly. No matching of any kind. |

## EMail vs UPN in this tenant, and what it affects

Confirmed on all three (Colleagues_Master items 932, 1000, 1004; nothing else in
the list touched). The account email and the login alias differ, consistently:

| Person | `EMail` | login claim |
|---|---|---|
| Ahmed | `ahmed.mokhtar@2seasonshotels.com` | `i:0#.f\|membership\|ahmedm@2seasonshotels.com` |
| Amir | `Amir.Monir@…` | `…\|amirm@…` |
| Xarmaigne | `xarmaigne.narciso@…` | `…\|xarmaignen@…` |

The tenant uses a **short UPN for sign-in with a separate SMTP address**:
`firstname.surname` for mail, `firstname` + surname's first initial for the login.

**The pattern being consistent does not make it usable, and this is worth stating
plainly because it looks like it should be.** The transform is not injective:
`ahmed.mokhtar` and `ahmed.mansour` both yield `ahmedm`. Across 335 active
colleagues, collisions are likely rather than hypothetical, and the failure is a
claim that resolves to a *different real person* — silent, and worse than an
error. Deriving a login from an address stays out of the design.

Item 1000 is also the strongest single argument for the whole approach: searching
`amir.monir@` returned display name **"Amir Monir"** on a Colleagues_Master row
named **"Amir Gerges Daoud"**, corroborated by job title (Assistant Human
Resources Manager vs Assistant HR Manager) and department. Name matching would
never have found him, in either direction.

**Reading `ColleagueAccountLookupId` sidesteps it entirely — correct as expected.**
The stored value of a Person column *is* the UIL item id. No address is compared,
so no address needs to agree with any other.

What it affects elsewhere:

- **`extractIdentityKeys` is already correct, by design not luck.** It indexes
  *every* email-like value on a UIL row — `EMail`, the claims tails of `Name` and
  `UserName`, and `UserPrincipalName` — so Ahmed's row registers **both**
  `ahmed.mokhtar@` and `ahmedm@`, both pointing at one LookupId. That is exactly
  the divergence it was written to absorb. Today's trainers resolve for this
  reason, and this design does not disturb it.
- **`mapUilItemToTrainer` prefers `EMail`**, so the trainer list has always
  offered `ahmed.mokhtar@` and the submit has always found it. Consistent.
- **It would have broken `ensureSiteUser`.** `membershipClaim(email)` builds
  `i:0#.f|membership|<EMail>`, which for Ahmed is
  `…|ahmed.mokhtar@…` — *not* his login, which is `…|ahmedm@…`. Constructing a
  claim from `EMail` is a guess that this tenant's data falsifies. That code is
  withdrawn with the escape hatch; the finding is recorded here because it is the
  second independent reason not to revive it, and because B3 should not assume the
  claim form is derivable if the consent ever lands.

### Address case: already safe, and about to be irrelevant

Amir's address is stored mixed-case (`Amir.Monir@`) while the other two are
lowercase. Audited every place the resolution path compares an address, and all of
them lowercase at the boundary:

| Site | What it lowercases |
|---|---|
| `sp-submit-training:79` (`extractIdentityKeys`) | every UIL identity value indexed |
| `sp-submit-training:159` (`normalizeTrainers`) | the client-supplied trainer email |
| `sp-submit-training:177` | the legacy `trainerNames` → email mapping |
| `uil-mapper.ts:27` (`extractEmail`) | the address put on each trainer option |
| `uil-mapper.ts:76` (`dedupeAndSortTrainers`) | the dedupe key |
| `auth.ts:17,31` | the caller's own email |

So `Amir.Monir@` resolves correctly **today**, and would have even before this
change. No fix needed.

Under this design it stops mattering: the submit path compares **no addresses at
all** — an employee id maps to a LookupId, both of them ids. The mixed case
survives only as a display detail.

## Design

### Source and the availability rule

The dropdown reads `Colleagues_Master` through the existing `sp-read-colleagues`
path (and its mirror). An option is **selectable** only when it is:

1. `IsActive` — the same filter the participant picker uses, so the deactivated
   test row (EmployeeID 111111, "Jihn") is excluded there too; and
2. carrying a populated `ColleagueAccount`.

**This is the load-bearing rule.** 335 colleagues are active; `ColleagueAccount`
is confirmed for three. Offering all 335 would rebuild the exact trap this
replaces — a picker that looks right and fails at submit for 332 people. So on day
one the trainer dropdown holds the same three names it effectively holds today,
and it grows as the column is filled. That is the honest behaviour and it must be
visible, not silent: the picker states how many colleagues have a linked account.

When the typed query matches an active colleague who has **no** linked account,
the picker says so instead of showing nothing:

> **Fatima Ali** is in the colleague list but has no linked account yet, so she
> can't be recorded as a trainer. Ask HR to set *ColleagueAccount* on her
> Colleagues_Master row.

Not selectable, and not silent — the same shape that worked for the blocked
directory case, without 332 rows of greyed noise. It also tells the maintainer
precisely what to fix.

### Who resolves the LookupId

**The client sends `employeeId`s; the edge function resolves them.** The client
never sends a LookupId.

- An id supplied by the client is unvalidated input written straight into a Person
  column — it would let any authenticated caller file a training against an
  arbitrary site user.
- A draft saved last week would carry a stale id if the account link changed.
  Resolving at submit always uses current data.

`sp-submit-training` gains a `trainerEmployeeIds: string[]` field, reads
`Colleagues_Master` once (336 rows, one page at `$top=500`), and maps each
employee id to its `ColleagueAccountLookupId`. An employee id that is missing,
inactive, or has no linked account is refused **by employee id and name**, in the
same shape as today's error.

This is *cheaper* than what it replaces: one targeted list read instead of the
full UIL scan.

`TrainerName_x002e_LookupId` is written exactly as now — a
`Collection(Edm.Int32)` of UIL ids. The write is unchanged; only where the ids
come from changes.

### Mutual exclusion

Both selections already live in `HotelTraining.tsx`, so the two sets lift to that
level and pass down. Both sides key on `employeeId` — which only became possible
once trainers are colleagues; email-to-employeeId would have been another
unreliable join.

The participant picker's existing exemption is kept and mirrored: a row always
shows *its own* current selection, so a selection never vanishes from the control
that holds it. Exclusion is live, not sticky — deselecting a trainer returns them
to the participant lists immediately.

### Drafts and backward compatibility

- **Existing SharePoint records are untouched.** The submit path only creates.
- **Saved drafts** hold `TrainerRef {displayName, email}`. Every legacy trainer
  selection is **dropped on load, with a visible notice naming who was removed**
  and asking the user to re-pick.

  *This corrects the first draft of this spec, which said drafts would be mapped by
  matching the draft's email against `ColleagueAccount`'s address. That mapping is
  not available: reading a Person column yields a **LookupId**, not an address.
  Getting an address for it means going back to the UIL — the read this design
  retires — so the "cheap migration" would have been a reason to keep the retiring
  dependency alive. A reliable bridge does exist (email → UIL id → colleague, both
  hops id-based) and it is still not worth it: the cost of dropping is re-picking
  from a three-item list in a half-filled form, and the cost of keeping it is the
  machinery this design exists to delete.*

  Precedent for dropping visibly rather than silently: `migrateLegacyTrainerDraft`
  already handles the pre-`TrainerRef` shape this way.
- **A draft holding one person as both** trainer and participant is reconciled on
  load — the trainer selection wins, the participant row is cleared, and the user
  is told. It must not be left in a state the form will reject at Next.
- **`FALLBACK_TRAINERS`** is deleted. Its purpose was an offline list when the
  trainer read failed; the colleague read has its own failure handling, and a
  hardcoded list of three names is what produced the "Amir Monir" divergence.
- **Deploy order is not free:** `sp-submit-training` ships **first**, accepting
  both `trainerEmployeeIds` and today's `trainers`, then the frontend. Reversed,
  anyone mid-session submits a body the function does not understand. The old
  field is removed in a later commit, not this one.

## What the team will see change

- The dropdown shows `ColleagueName`, so **"Amir Gerges Daoud" where they are used
  to "Amir Monir"**, with `ID: 102387` beside it — the participant picker's exact
  layout. Not wrong: the colleague list is the source of truth. Worth announcing
  rather than letting people discover.
- **The SharePoint record does not change name.** `TrainerName_x002e_` is a Person
  column with no text mirror, so the stored value renders the *account's* display
  name, not `ColleagueName`. One consequence to verify before cutover: a person can
  therefore appear as "Amir Gerges Daoud" in the picker and as something else in the
  record and the training report. That is pre-existing behaviour, not introduced
  here, but it becomes visible.
- A colleague who is not selectable now says why, where previously the field simply
  did not contain them.

## Tests

Unit — pure logic, no Graph:

1. `selectableTrainers` excludes inactive, excludes accountless, keeps both.
2. Employee-id → LookupId mapping refuses missing / inactive / accountless with
   the id *and* the name in the message.
3. Draft migration: mappable by account address, unmappable dropped, and the
   trainer-wins reconciliation of an overlapping draft.

E2E — four exclusion cases, both directions and both orders:

4. Trainer picked → absent from every participant dropdown.
5. Participant picked → absent from the trainer dropdown.
6. Deselect a trainer → available again as a participant.
7. Draft with the same person in both → reconciled, notice shown, form submittable.

Plus: an accountless colleague's explanation is reachable and the row is not
selectable; and the submit body carries `trainerEmployeeIds`, never a LookupId.

**Mutation checks, or the tests are decoration:** removing the exclusion set must
fail 4–6; making an accountless colleague selectable must fail the explanation
test; sending a LookupId from the client must fail test 7's body assertion. Each
is verified to fail before the work is called done — the layout test in `aa16231`
is why this is stated explicitly.

The escape-hatch tests and `sp-search-directory`, `_shared/directory.ts`,
`_shared/sharepoint-rest.ts` and `_shared/uil.ts` are removed with the feature, in
their own commit, so the deletion is reviewable separately from the new field.

## Unproven, and what would settle it

- **The exact Graph field name.** Person columns are read as
  `<InternalName>LookupId`, and `ColleagueAccount`'s *internal* name may differ
  from its display name if it was renamed after creation. `$select` on a wrong name
  errors rather than returning null, which would take the colleague read down.
  **One probe settles it:** read
  `/sites/{siteId}/lists/{colleaguesListId}/columns?$select=name,displayName` and
  use `name`. Until then the implementation must not assume `ColleagueAccount`.
- **Whether all three trainers' rows survive the `IsActive` filter** — expected,
  unverified.
- Everything here is unexercised against the real tenant. No Azure credentials
  exist in the dev environment, so the e2e suite mocks at the HTTP boundary; the
  first real submission after cutover is the only proof of the LookupId read, the
  same way `$batch` was proven on 2026-08-03.
