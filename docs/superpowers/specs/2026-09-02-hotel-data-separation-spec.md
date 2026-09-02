# Spec: hard hotel-data separation for competitor rates

Status: SPEC ONLY — Rev 2, 2026-09-02, nothing executed.
Rev 2 incorporates three operator findings from a read-only check of the live
project: (1) `"Al Khalidia Competitor Hotel room Rates"` already exists
(migration `20260902162424`, applied outside both repo checkouts) — Rev 1's
§1 mirror table is **withdrawn** and the live table is **adopted**; (2) three
columns on the 2S table are `GENERATED ALWAYS … STORED`, which Rev 1's column
check missed (correction record in §1.b); (3) this project's default
privileges deliberately withhold `TRUNCATE` from `anon` on new tables — Rev 1's
grant block would have re-granted it and is withdrawn.
Rev 3 (operator correction): the Rev 2 §1 read policy is **withdrawn** —
Al Khalidia is a separate hotel and must not be readable from the Two Seasons
dashboard at all. RLS-on / zero-policies is the deliberate end state, and
`is_hotel_staff()` must never be attached to the Khalidia table.
Rev 4 (operator decision): the Rev 2 finding "no unique report-row key, no
upsert trigger" was never withdrawn (it stayed flagged in §1's design deltas
through Rev 3) and is now **promoted from flagged to prescribed**: §1A adds
the unique key + upsert trigger to the Khalidia table, and it must be applied
**before** the workflow is repointed. Unreadability (separation) and
duplicate-on-rerun (data integrity inside Khalidia's own table) are
independent concerns; Rev 3 settled the first, §1A settles the second.
Every fact below was established from the repo or a read-only query on
2026-09-02; what could not be established that way is in §7.

## Goal

Two hotels share one Supabase project. Hard separation:

- **Two Seasons** → `public."Two Seasons Competitor Hotel room Rates"`, written
  ONLY by the n8n workflow **`2S Competitor Hotel Price Monitor Pro`**.
- **Al Khalidia** → the already-created
  `public."Al Khalidia Competitor Hotel room Rates"` (adopted; the
  `khaldia_competitor_hotel_rates` name from the original request is
  superseded by the table that exists).
- Experimental scrapers must never reach a production table.

## §0 Verified facts this spec rests on

Writers observed in `"Two Seasons Competitor Hotel room Rates"` (2,835 rows):

| workflow_id | workflow_name | rows | dates |
|---|---|---|---|
| `MsQNaHazlqG0Dybk` | 2S Competitor Hotel Price Monitor Pro | 2,590 | 04-20 → 07-29 |
| `S3VJEBMLPqn80qWC` | 2S Competitor Hotel Price Monitor Pro | 140 | 08-24 → 08-27 |
| `abRy3aCkNGdOloOd` | Al Khaldia Brand Website Focus 5 Hotels Price Monitor | **70** | 08-25 → 08-26 |
| `abg9BxgzVJ6yJSPX` | 2S Comp-Set Rate Monitor (Direct API + BD SERP) | **35** | 08-26 |

- **The legit workflow has already changed `workflow_id` once** (rebuilt in
  August; the *name* stayed byte-identical). Any guard keyed to a single
  workflow_id is therefore wrong by observed history; the guard below keys on
  `workflow_name`.
- The foreign/duplicate set is exactly **105 rows** (70 + 35), **all currently
  `dry_run = false`**, id ranges 2873–3167 and 3238–3272. Zero rows under those
  two workflow_ids are `dry_run = true`, which is what makes the reverse UPDATE
  in §2 exact.
- **Two readers, not one**: the dashboard
  (`src/hooks/insights/useCompetitorsInsights.ts`) and Sera
  (`supabase/functions/chat-with-data/rates-query-service.ts`,
  `context-data-fetcher.ts`). Both filter `dry_run = false` and
  `status in ('success','price_found')` — so the §2 quarantine cleans **both**;
  the §3 pin protects only the dashboard.
- 2S table shape (re-verified column by column for Rev 2, including
  `is_generated` — see §1.b): PK `id` (sequence default, not identity), CHECK
  `status in ('price_found','sold_out','price_not_found','scrape_failed','review_needed')`
  (note: the readers' `'success'` filter value is impossible under this CHECK —
  dead value, harmless, out of scope), UNIQUE
  `(workflow_id, report_date, hotel_name, checkin_date)`, five secondary
  indexes, a **BEFORE INSERT trigger**
  `trg_two_seasons_competitor_rates_insert_as_upsert` that converts a
  conflicting INSERT into an UPDATE of the matching row (returning NULL on the
  update path), and **three STORED generated columns**:
  `price_source = (raw_result ->> 'price_source')`,
  `source_kind = (raw_result ->> 'source_kind')`,
  `source_label = (raw_result ->> 'source_label')`.
- 2S RLS: enabled, not forced; the ONLY policy is
  `"Hotel staff can read competitor rates"` — PERMISSIVE, FOR SELECT, TO
  `authenticated`, `USING (is_hotel_staff(auth.uid()))`. No write policies:
  writes work only as `service_role`.
- 2S grants are the **pre-hardening** platform defaults: all seven privileges
  (incl. TRUNCATE) to `anon`, `authenticated`, `postgres`, `service_role` —
  the table predates the 2026-09-01 default-privilege hardening (next bullet)
  and was grandfathered. Effective access is constrained by RLS, not grants.
- **Default privileges are hardened** (verified in `pg_default_acl`): for
  postgres-created tables in `public`, `anon = arwdxt` — every privilege
  **except `D` = TRUNCATE** — while `authenticated` and `service_role` get the
  full `arwdDxt`. New tables inherit this automatically; the live Khalidia
  table's grants match it exactly. Sequences default to `rwU` for all four
  roles.
- **`public."Al Khalidia Competitor Hotel room Rates"` exists** (0 rows):
  ledger row `20260902162424 · create_al_khalidia_competitor_hotel_room_rates`
  (1 statement). Purpose-built, richer schema than the 2S table (~56 columns:
  `confidence`, `rate_basis`, `tax_basis`, `member_rate_excluded`,
  `comparable_for_lowest`, `displayed_price`, `promotional_price`,
  `comparison_price`, `comparison_eligible`, `comparison_exclusion_reason`,
  `rate_classification`, `rate_conditions`, `restrictions`,
  `payment_conditions`, `cancellation_conditions`, `board_basis`, `room_type`,
  `is_club`, `confidential`, `requested_occupancy`, `property_token`,
  `taxes_amount`, `fees_amount`, `source_url`, …). `id` is
  `GENERATED BY DEFAULT AS IDENTITY`. `price_source`/`source_kind` are plain
  columns here (no `source_label`, no `accor_tax_type`, no `updated_at`).
  `hotel_name`, `checkin_date`, `status` are NULLable. Constraints: **PK only**
  — no status CHECK, no unique report-row key, no triggers. Two indexes
  (`report_date DESC`; `(source_group, checkin_date)`). RLS enabled, not
  forced, **zero policies**. Grants = the hardened defaults above.
- Neither table is in any publication (no realtime), neither has a comment,
  both have default replica identity, owner `postgres` on both, and only
  `postgres` holds grantable privileges.
- The legacy empty `public.competitor_hotel_rates` (0 rows) is untouched and
  out of scope.

### §0.b Provenance of migration 20260902162424 (asked in the Rev 2 review)

What a read-only check can and cannot establish:

- It is in the remote ledger (`supabase_migrations.schema_migrations`) with a
  descriptive snake_case name, the style the MCP `apply_migration` pathway
  produces.
- It is in **neither checkout**: this repo's `supabase/migrations/` ends at
  `20260901100401…`, the production checkout's at `20260804110000…`, the
  string "khalidia" appears nowhere in either tree (outside this spec), and
  this repo has no git activity under `supabase/migrations` since 09-01.
  **So: it did not come from this repo.**
- Ledger-version ≠ repo-filename is normal here (the 09-01 hardening
  migrations sit in the ledger as `202609011350xx` while their repo files are
  `202609011003xx–1004xx`) — but those exist as files; this one exists nowhere
  on disk, **including no `*_rollback.sql` sibling**, which the repo convention
  requires (flagged in §6).
- **Who ran it is not determinable read-only**: the ledger stores no user
  identity. The version stamp reads 2026-09-02 16:24:24; whether that stamp is
  UTC or local depends on the client that generated it, also not determinable.
  It was applied through the migrations pathway (MCP/CLI) by someone with
  access to the project outside both checkouts — consistent with the operator
  or a concurrent session, and with its timing shortly after the incident
  report that named Al Khaldia.

## Recommended execution order

1. §1 — nothing to apply: the adopted Khalidia table is already in its
   intended end state for *access* (RLS on, zero policies — deliberately
   unreadable by `authenticated` and `anon`; the n8n writer is unaffected
   because `service_role` bypasses RLS).
2. §1A — unique report-row key + upsert trigger on the Khalidia table.
   **MUST precede step 3**: on the still-empty table the constraint applies
   unconditionally; once the repointed workflow has written duplicates, the
   same ALTER can fail and would first need a manual dedup.
3. *Operator*: repoint the Al Khaldia workflow at the adopted table, decide
   the remaining §1 design deltas (2–4), and decide the fate of the
   experimental 2S monitor (n8n is out of scope for this spec).
4. §4 — install the writer guard on the 2S table. If installed **before** the
   Khaldia workflow is repointed, that workflow's inserts will fail loudly in
   n8n until step 3 happens — acceptable, but it is a choice; this order avoids it.
5. §2 — quarantine the 105 rows (after the guard, nothing can re-pollute or
   un-flip them).
6. §3 — dashboard pin (any time; defense in depth).

---

## §1 (Rev 3) Adopt `public."Al Khalidia Competitor Hotel room Rates"`

**Decision: adopt.** Two live tables for the same purpose is how one of them
gets forgotten (backlog B10's lesson, learned in this repo). The existing
table is also strictly better for the job than Rev 1's mirror: it carries the
~26 richer columns the Al Khalidia scraper actually emits. Rev 1's
`create table public.khaldia_competitor_hotel_rates …` DDL — including its
generated-columns error and its `anon` TRUNCATE grant — is **withdrawn in
full** and appears nowhere below.

### Read access: none — deliberately (Rev 3, operator decision)

Rev 2 read "RLS enabled, zero policies" as a gap and specified a read policy
using `is_hotel_staff()`. **The operator corrected that: Al Khalidia is a
separate hotel and must not be readable from the Two Seasons dashboard at
all.** The table's current state IS the intended end state:

- n8n writes as `service_role`, which bypasses RLS — the writer needs no
  policy.
- Every `authenticated` reader — which is to say, the entire Two Seasons
  dashboard — sees **zero rows**: RLS enabled, no policy grants anything.
  `anon` likewise.
- **`is_hotel_staff()` must never be attached to this table.** It is the Two
  Seasons roster; a policy built on it would put Al Khalidia data in front of
  Two Seasons staff — the opposite of the separation goal.
- If Al Khalidia ever needs human readers, that requires **its own roster
  function** (backed by its own staff list or claim) in a new,
  Khalidia-specific policy — not a reuse of the Two Seasons oracle.

§1 therefore prescribes **no migration**. Its deliverable is this recorded
decision plus the verification below.

**Behaviour verification** (probes, not catalogue — proving the
*unreadability* is the point):

```sql
-- as service_role: the writer path works with zero policies (RLS bypass)
insert into public."Al Khalidia Competitor Hotel room Rates"
  (workflow_id, generated_at, report_date, hotel_name, checkin_date, status, dry_run)
values ('probe', now(), current_date, 'Probe Hotel', current_date, 'review_needed', true);
-- authenticated must see NOTHING — no staff account, no JWT claim, no
-- exception; with zero policies this holds regardless of who the user is:
select set_config('role', 'authenticated', true);
select count(*) = 0 as authenticated_sees_nothing
from public."Al Khalidia Competitor Hotel room Rates";
reset role;
-- anon likewise:
select set_config('role', 'anon', true);
select count(*) = 0 as anon_sees_nothing
from public."Al Khalidia Competitor Hotel room Rates";
reset role;
-- cleanup:
delete from public."Al Khalidia Competitor Hotel room Rates" where workflow_id = 'probe';
```

### Grants: none. (Rev 1's grant block is withdrawn.)

The live table proves the project's default privileges already produce the
intended posture — including the deliberate absence of `anon` TRUNCATE
(`pg_default_acl`: `anon=arwdxt` on new public tables). The spec therefore
issues **no GRANT statements at all**; issuing them is how Rev 1 nearly
re-granted what the 2026-09-01 hardening removed. Justification of each
privilege the defaults leave in place:

| Grantee | Privileges (live) | Why it stays |
|---|---|---|
| `service_role` | all 7 | the writer path (n8n) and maintenance; RLS-exempt by role attribute, but the privilege check still applies |
| `authenticated` | all 7 | **all inert by design (Rev 3)** — RLS is on and zero policies exist, so PostgREST refuses every authenticated read and write at the policy layer; this is the mechanism that keeps Al Khalidia data out of the Two Seasons dashboard. Revoking the grants per-table would add nothing and diverge from every other table; that is a project-wide default-privileges decision, already made once on 09-01 for TRUNCATE |
| `anon` | 6 (no TRUNCATE) | all inert — RLS deny-by-default and no policy names anon; kept for uniformity with the project's default posture |
| `postgres` | all 7, grantable | owner |
| sequence `…_id_seq` | USAGE ×4 roles | identity assignment needs it on the writer path; harmless elsewhere |

Observation, out of scope but cheap: the **2S** table still grants `anon`
TRUNCATE (grandfathered from before the 09-01 hardening). A one-line
`revoke truncate on public."Two Seasons Competitor Hotel room Rates" from anon;`
would align it with the project posture — operator's call (§6).

### Design deltas the operator should confirm as intentional

Flagged, not prescribed — the table looks deliberately designed, but these
four differences from the 2S table have operational consequences:

1. **No unique `(workflow_id, report_date, hotel_name, checkin_date)` key and
   no insert-as-upsert trigger** → a re-run of the same scrape **appends
   duplicates** instead of updating in place. That is the same duplication
   class that just polluted the 2S page. **Decided in Rev 4: prescribed in
   §1A, to be applied before the workflow is repointed.**
2. `hotel_name`, `checkin_date`, `status` are NULLable and there is no status
   CHECK — nothing refuses a malformed row.
3. No `updated_at` column.
4. `price_source`/`source_kind` are **plain** columns here (the scraper writes
   them directly), unlike the 2S table where they are STORED generated columns
   off `raw_result` (and there is no `source_label` at all). Any future shared
   tooling must not assume the two tables agree on this.

### Rollback

Nothing to roll back — Rev 3's §1 changes nothing in the database; it records
the zero-policy state as deliberate. (The **table itself is not this spec's to
roll back** — it belongs to migration `20260902162424`, which has no rollback
sibling anywhere on disk, §6.) If a future decision adds a Khalidia-specific
read policy, that policy's own migration carries its own rollback.

### §1.b Correction record (Rev 2) — the generated-columns miss and its blast radius

Rev 1's column check selected only `column_name, data_type, is_nullable,
column_default, is_identity` from `information_schema.columns`; every property
outside those five was implicitly assumed not to exist. That assumption
covered, and hid: **generated columns** (the actual miss —
`price_source`, `source_kind`, `source_label` on the 2S table are
`GENERATED ALWAYS AS (raw_result ->> '<key>') STORED`), plus collations,
comments, replica identity, publication membership, FORCE RLS, sequence
parameters, and privilege grantability.

Re-verified 2026-09-02 (read-only), both tables: generated columns — exactly
the three above on 2S, none on Khalidia; collations — all default; comments —
none; replica identity — default on both; publications — neither table in
any (no realtime dependency); FORCE RLS — off on both; owner — `postgres`
both; grantable privileges — `postgres` only. Still unchecked, accepted as
immaterial for this spec: per-column storage/compression attributes and
sequence increment/cache parameters.

Blast radius on the rest of Rev 1: **§2, §3, §4 are untouched** — the
quarantine flips `dry_run` (a plain column), the dashboard pin filters
`hotel_name` (plain), and the §4 guard and probes never assign the generated
columns (nor does the existing upsert trigger, which is itself consistent with
them being unassignable). The withdrawn mirror DDL was the only artifact
carrying the error.

---

## §1A (Rev 4) Khalidia report-row idempotency: unique key + upsert trigger

Promoted from §1's design-delta item 1 (flagged in Rev 2, never withdrawn,
decided by the operator in Rev 4). This is a **data-integrity concern inside
Khalidia's own table**, independent of the Rev 3 unreadability decision:
verified live, the table has only `PRIMARY KEY (id)` and zero triggers, so a
re-run of the same scrape appends duplicates — the same failure class that
polluted the 2S page.

**Ordering is part of the spec: apply BEFORE the workflow is repointed.** The
table has 0 rows today, so the unique constraint installs unconditionally.
Once the repointed workflow has written a duplicate, the same ALTER fails
until someone hand-dedups — the cheap moment is now.

Migration `supabase/migrations/<ts>_khalidia_rates_idempotency.sql`
(+ rollback sibling, repo convention; via MCP `apply_migration` when approved):

```sql
-- Precondition: the constraint must land on the empty table. Abort the
-- migration if scraping has already started.
do $$
begin
  if (select count(*) from public."Al Khalidia Competitor Hotel room Rates") > 0 then
    raise exception 'table is no longer empty — dedup before adding the unique key';
  end if;
end $$;

alter table public."Al Khalidia Competitor Hotel room Rates"
  add constraint khalidia_rates_unique_report_row
  unique (workflow_id, report_date, hotel_name, checkin_date);

-- Same INSERT-becomes-UPDATE contract as the 2S table, ported to this
-- table's full column set. Key columns (workflow_id, report_date,
-- hotel_name, checkin_date) and id/created_at are not updated; every other
-- writable column takes the incoming value. There is no updated_at column
-- on this table (§1 delta 3), so unlike the 2S version nothing records the
-- overwrite time.
create or replace function public.khalidia_rates_insert_as_upsert()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  update public."Al Khalidia Competitor Hotel room Rates"
  set
    workflow_name = new.workflow_name,
    execution_id = new.execution_id,
    generated_at = new.generated_at,
    dry_run = new.dry_run,
    source_group = new.source_group,
    checkout_date = new.checkout_date,
    status = new.status,
    confidence = new.confidence,
    original_price = new.original_price,
    original_currency = new.original_currency,
    converted_price_aed = new.converted_price_aed,
    price_source = new.price_source,
    source_kind = new.source_kind,
    rate_basis = new.rate_basis,
    tax_basis = new.tax_basis,
    member_rate_excluded = new.member_rate_excluded,
    comparable_for_lowest = new.comparable_for_lowest,
    displayed_price = new.displayed_price,
    promotional_price = new.promotional_price,
    source_original_price = new.source_original_price,
    comparison_price = new.comparison_price,
    comparison_eligible = new.comparison_eligible,
    comparison_exclusion_reason = new.comparison_exclusion_reason,
    rate_classification = new.rate_classification,
    rate_conditions = new.rate_conditions,
    promotion_name = new.promotion_name,
    discount_percent = new.discount_percent,
    restrictions = new.restrictions,
    payment_conditions = new.payment_conditions,
    cancellation_conditions = new.cancellation_conditions,
    board_basis = new.board_basis,
    room_type = new.room_type,
    taxes_type_raw = new.taxes_type_raw,
    is_club = new.is_club,
    confidential = new.confidential,
    requested_occupancy = new.requested_occupancy,
    occupancy_verification = new.occupancy_verification,
    property_token = new.property_token,
    property_identity_verification = new.property_identity_verification,
    request_country = new.request_country,
    signature_status = new.signature_status,
    taxes_amount = new.taxes_amount,
    fees_amount = new.fees_amount,
    booking_url = new.booking_url,
    source_url = new.source_url,
    error_message = new.error_message,
    request_id = new.request_id,
    is_lowest_for_day = new.is_lowest_for_day,
    lowest_price_for_day_aed = new.lowest_price_for_day_aed,
    summary = new.summary,
    parser_debug = new.parser_debug,
    raw_result = new.raw_result
  where workflow_id = new.workflow_id
    and report_date = new.report_date
    and hotel_name = new.hotel_name
    and checkin_date = new.checkin_date;

  if found then
    return null;
  end if;

  return new;
end;
$function$;

create trigger trg_khalidia_rates_insert_as_upsert
  before insert on public."Al Khalidia Competitor Hotel room Rates"
  for each row execute function public.khalidia_rates_insert_as_upsert();
```

**NULL-key caveat, stated plainly.** `hotel_name` and `checkin_date` are
NULLable on this table (§1 delta 2; NOT NULL on the 2S table). Both the
constraint (default `NULLS DISTINCT`) and the trigger's `=` matching treat a
NULL key as never-equal, so **rows with a NULL hotel_name or checkin_date fall
outside the idempotency net** — they insert as new rows on every re-run. This
mirrors the 2S semantics exactly rather than inventing new ones
(`NULLS NOT DISTINCT` / `IS NOT DISTINCT FROM` would instead make distinct
failure rows overwrite each other). If the scraper never legitimately writes
NULL keys, the clean follow-up is `SET NOT NULL` on both columns — an operator
decision, since only the workflow's author knows whether failure rows carry
them (§7).

**Trigger-ordering note:** this is currently the only trigger on the table.
If a writer guard is ever added here too, the §4 rule applies — the guard's
name must sort before `trg_khalidia_rates_insert_as_upsert`, because this
trigger returns NULL on its UPDATE path and suppresses later triggers.

**Behaviour verification** (service_role; probes clean up after themselves):

```sql
-- same key twice: second insert must become an UPDATE, not a second row
insert into public."Al Khalidia Competitor Hotel room Rates"
  (workflow_id, workflow_name, generated_at, report_date, hotel_name, checkin_date, status, dry_run)
values ('probe', 'first-write', now(), current_date, 'Probe Hotel', current_date, 'review_needed', true);
insert into public."Al Khalidia Competitor Hotel room Rates"
  (workflow_id, workflow_name, generated_at, report_date, hotel_name, checkin_date, status, dry_run)
values ('probe', 'second-write', now(), current_date, 'Probe Hotel', current_date, 'review_needed', true);
select count(*) = 1 as upsert_worked,
       bool_and(workflow_name = 'second-write') as update_path_ran
from public."Al Khalidia Competitor Hotel room Rates" where workflow_id = 'probe';
-- cleanup:
delete from public."Al Khalidia Competitor Hotel room Rates" where workflow_id = 'probe';
```

**Rollback** (`_rollback.sql` sibling):

```sql
drop trigger if exists trg_khalidia_rates_insert_as_upsert
  on public."Al Khalidia Competitor Hotel room Rates";
drop function if exists public.khalidia_rates_insert_as_upsert();
alter table public."Al Khalidia Competitor Hotel room Rates"
  drop constraint if exists khalidia_rates_unique_report_row;
```

**What rolling back costs:** no data is lost; re-runs append duplicates again,
and any INSERT built to rely on the upsert contract starts double-writing.

---

## §2 Quarantine of the 105 foreign/duplicate rows

Not a migration — a one-off data change, reversible by construction. `dry_run`
is the right lever because **both** readers already filter `dry_run = false`,
and nothing is deleted.

**Step 1 — verify before touching anything:**

```sql
select workflow_name, workflow_id,
       count(*)                          as rows,
       count(*) filter (where dry_run)   as already_dry_run,   -- must be 0
       min(id) as min_id, max(id) as max_id,
       min(report_date) as first_day, max(report_date) as last_day
from public."Two Seasons Competitor Hotel room Rates"
where workflow_id in ('abRy3aCkNGdOloOd', 'abg9BxgzVJ6yJSPX')
group by 1, 2
order by 1;
```

Expected (verified 2026-09-02 — abort if it differs):

| workflow_name | rows | already_dry_run | min_id–max_id | days |
|---|---|---|---|---|
| 2S Comp-Set Rate Monitor (Direct API + BD SERP) | 35 | 0 | 3238–3272 | 08-26 |
| Al Khaldia Brand Website Focus 5 Hotels Price Monitor | 70 | 0 | 2873–3167 | 08-25 → 08-26 |

**Step 2 — the UPDATE** (touches `dry_run` only; there is no `updated_at`
trigger on UPDATE, so no other column moves and the reverse is byte-exact):

```sql
update public."Two Seasons Competitor Hotel room Rates"
set dry_run = true
where workflow_id in ('abRy3aCkNGdOloOd', 'abg9BxgzVJ6yJSPX')
  and dry_run = false;
-- expected: UPDATE 105
```

**Step 3 — its exact reverse:**

```sql
update public."Two Seasons Competitor Hotel room Rates"
set dry_run = false
where workflow_id in ('abRy3aCkNGdOloOd', 'abg9BxgzVJ6yJSPX')
  and dry_run = true;
-- expected: UPDATE 105
```

The reverse is exact **because** Step 1 proved `already_dry_run = 0`: every
`dry_run = true` row under those two workflow_ids can only be one we flipped.
That stops being true if either workflow writes again before the §4 guard is
in place (a re-run for a *past* report_date would even flow through the upsert
trigger's UPDATE path and reset `dry_run` from the incoming row) — hence the
execution order above.

---

## §3 Dashboard pin: comp set by hotel name

File: `src/hooks/insights/useCompetitorsInsights.ts`. Current query (lines
25–36):

```ts
const rows = await fetchAllRows((from, to) =>
  supabase
    .from('Two Seasons Competitor Hotel room Rates')
    .select('id, hotel_name, checkin_date, report_date, converted_price_aed, status, dry_run, is_lowest_for_day, lowest_price_for_day_aed')
    .gte('report_date', fromDateKey)
    .lte('report_date', toDateKey)
    .eq('dry_run', false)
    .in('status', ['success', 'price_found'])
    .order('report_date', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to)
);
```

Proposed — add a named comp-set constant and one `.in()` clause:

```ts
// The Two Seasons comp set, pinned by name. These five spellings have been
// byte-stable in the scraper's output since 2026-04-20, across a rebuild of
// the workflow (two workflow_ids, same names). Pinning by name rather than by
// workflow identity means a foreign writer can never widen this page; the
// trade-off is that a deliberate comp-set change (or a scraper renaming a
// hotel) must update this list — which is the point: comp-set changes should
// be visible in a diff, not silent in the data.
const TWO_SEASONS_COMP_SET = [
  'Two Seasons Hotel',
  'Atana Hotel',
  'Grand Millennium Dubai',
  'Mercure Dubai Barsha Heights Hotel Suites And Apartments',
  'Novotel Dubai Al Barsha',
];
```

```ts
    .eq('dry_run', false)
    .in('status', ['success', 'price_found'])
    .in('hotel_name', TWO_SEASONS_COMP_SET)     // ← the one added line
    .order('report_date', { ascending: true })
```

Everything downstream (`byHotel`, `trendIndex`, `lowestDays`, `totalHotels`)
already keys off the returned rows, so the KPIs, rank (#N **of 5**), trend and
both bar charts correct themselves with no further change.

**Failure mode to know:** if the scraper ever changes a hotel's spelling, that
hotel silently drops off the page; the visible symptom is `OUR RANK … of 4`.
**Scope note:** Sera's rates tool is *not* pinned by this change — it stays
protected by §2 (data) and §4 (guard) only.

**Rollback:** `git revert` of the commit (one hunk + one constant).

---

## §4 Writer guard on the 2S table (optional, recommended)

**Why a trigger and not a CHECK.** A CHECK is validated against existing rows
when added, applies to UPDATEs forever, and cannot raise a message naming the
offender. Concretely: `CHECK (workflow_name = '2S…Pro')` fails to install
while the 105 foreign rows exist (unless `NOT VALID`, which is a weaker,
easy-to-forget state) and — worse — would make the §2 reverse UPDATE
impossible, because updating any foreign row re-evaluates the CHECK and
rejects it. A BEFORE INSERT trigger judges only new writes.

**Why keyed on `workflow_name`, not `workflow_id`.** Observed history (§0):
the legitimate workflow was rebuilt once already — the id changed, the name
did not. An id allowlist would have broken the legit scraper in August.

**Trigger-name constraint (load-bearing):** BEFORE INSERT row triggers fire in
alphabetical order, and the existing upsert trigger
(`trg_two_seasons_competitor_rates_insert_as_upsert`) **returns NULL on its
UPDATE path**, which suppresses any trigger after it. The guard must therefore
sort FIRST — the `trg_aa_` prefix below is not cosmetic.

```sql
create or replace function public.two_seasons_competitor_rates_writer_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.workflow_name is distinct from '2S Competitor Hotel Price Monitor Pro' then
    raise exception
      'workflow "%" (id %) may not write to "Two Seasons Competitor Hotel room Rates" — single-writer by design; see docs/superpowers/specs/2026-09-02-hotel-data-separation-spec.md',
      coalesce(new.workflow_name, '<null>'), coalesce(new.workflow_id, '<null>');
  end if;
  return new;
end;
$function$;

create trigger trg_aa_two_seasons_competitor_rates_writer_guard
  before insert on public."Two Seasons Competitor Hotel room Rates"
  for each row execute function public.two_seasons_competitor_rates_writer_guard();
```

**Behaviour verification** (service_role; probes clean up after themselves;
note the probes deliberately do not assign the three generated columns — they
are unassignable):

```sql
-- must FAIL with the guard's exception:
insert into public."Two Seasons Competitor Hotel room Rates"
  (workflow_id, workflow_name, generated_at, report_date, hotel_name, checkin_date, status, dry_run)
values ('probe-foreign', 'Some Other Workflow', now(), current_date, 'Probe Hotel', current_date, 'review_needed', true);

-- must SUCCEED (then clean up):
insert into public."Two Seasons Competitor Hotel room Rates"
  (workflow_id, workflow_name, generated_at, report_date, hotel_name, checkin_date, status, dry_run)
values ('probe-legit', '2S Competitor Hotel Price Monitor Pro', now(), current_date, 'Probe Hotel', current_date, 'review_needed', true);
delete from public."Two Seasons Competitor Hotel room Rates" where workflow_id = 'probe-legit';
```

**Failure modes, stated plainly:**

- **A legitimate new writer is added later** (e.g. the experimental monitor is
  promoted): its inserts fail **loudly** — the n8n execution errors with the
  exception text above, and the dashboard simply stops getting that writer's
  rows. Nothing corrupts. The fix is one `CREATE OR REPLACE` of the guard
  function extending the allowed-name test. This loud-failure mode is chosen
  deliberately over the auto-flag variant below.
- **The Pro workflow is renamed in n8n**: same loud failure, from the
  legitimate scraper — new rows rejected until the guard's literal is updated.
  Data goes stale but stays clean; the symptom is n8n execution errors plus a
  growing gap on the dashboard.
- **A writer spoofs the name**: the guard is advisory against a cooperative
  mistake (the actual incident), not against a malicious writer — anything
  with `service_role` can claim the Pro name. Real writer authentication is
  out of scope.

**Auto-flag variant** (if silent quarantine is preferred — not recommended:
rows from an unexpected writer would vanish into `dry_run = true` with no
error anywhere, which is this repo's documented false-green pattern):

```sql
-- body replacement for the same function:
begin
  if new.workflow_name is distinct from '2S Competitor Hotel Price Monitor Pro' then
    new.dry_run := true;   -- quarantined, invisible to all readers
  end if;
  return new;
end;
```

**Rollback:**

```sql
drop trigger if exists trg_aa_two_seasons_competitor_rates_writer_guard
  on public."Two Seasons Competitor Hotel room Rates";
drop function if exists public.two_seasons_competitor_rates_writer_guard();
```

**What rolling back costs:** the table is again writable by any service-role
client with any workflow identity — the exact state that produced this incident.

---

## §5 Rollback summary

| Item | Rollback | Cost |
|---|---|---|
| §1 | nothing to roll back — no DB change; the deliberate zero-policy state is recorded, not created | the adopted table itself belongs to migration `20260902162424`, which has **no rollback sibling on disk** (§6) |
| §1A | drop trigger + function + unique constraint | no data lost; re-runs append duplicates again, and a writer relying on the upsert contract double-writes |
| §2 quarantine | the reverse UPDATE (expected 105) | none; byte-exact while the guard/redirect holds |
| §3 dashboard pin | `git revert` | page is again exposed to any writer in the table |
| §4 guard | drop trigger + function | table is again open to any service-role writer |

## §6 Out of scope (owned by the operator)

- All n8n edits: repointing the Al Khaldia workflow, the fate of the
  experimental `2S Comp-Set Rate Monitor`, and why the Pro workflow has
  written nothing since 08-27 (six days of silence as of today — worth a look
  while in there).
- The remaining §1 design-delta decisions on the adopted table (deltas 2–4:
  NULLable key columns / no status CHECK, no `updated_at`, plain vs generated
  source columns). Delta 1 — duplicates on re-run — is decided and prescribed
  in §1A.
- A `*_rollback.sql` sibling for migration `20260902162424` — the repo
  convention says every migration gets one; whoever applied it owes it.
- Aligning the 2S table with the hardened default posture
  (`revoke truncate … from anon` — grandfathered pre-09-01 grant).
- The empty legacy `public.competitor_hotel_rates` table (unknown purpose).

## §7 What could NOT be determined from the repo or a read-only query

- **Who applied migration `20260902162424`** — the ledger records no user
  identity; only "not from either checkout, via the migrations pathway" is
  determinable (§0.b). Likewise whether its version stamp is UTC or local.
- Whether the Al Khalidia scraper ever writes rows with NULL `hotel_name` or
  `checkin_date`. §1A's idempotency deliberately excludes NULL-keyed rows
  (mirroring 2S semantics); if the scraper never writes them, `SET NOT NULL`
  on both columns is the clean follow-up — only the workflow's author knows.
- The shape of a future Al Khalidia roster function, if human readers are
  ever wanted — decided only in the negative (§1: it must NOT be
  `is_hotel_staff()`; the table stays unreadable until Khalidia has its own
  oracle).
- Anything inside the n8n workflows themselves (ids/names above are taken from
  what the workflows wrote into the table).
- Why the Pro scraper stopped after 08-27, and why its competitor rows on
  08-27 all carry non-success statuses.
