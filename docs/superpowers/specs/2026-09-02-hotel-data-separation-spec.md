# Spec: hard hotel-data separation for competitor rates

Status: SPEC ONLY — written 2026-09-02, nothing executed. Every fact below was
established from the repo or a read-only query on 2026-09-02; anything that
could not be established that way is listed in §7.

## Goal

Two hotels share one Supabase project. Hard separation:

- **Two Seasons** → `public."Two Seasons Competitor Hotel room Rates"`, written
  ONLY by the n8n workflow **`2S Competitor Hotel Price Monitor Pro`**.
- **Al Khaldia** → new table `public.khaldia_competitor_hotel_rates`.
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
- Table shape: PK `id` (bigserial-style sequence default), CHECK
  `status in ('price_found','sold_out','price_not_found','scrape_failed','review_needed')`
  (note: the readers' `'success'` filter value is impossible under this CHECK —
  dead value, harmless, out of scope), UNIQUE
  `(workflow_id, report_date, hotel_name, checkin_date)`, five secondary
  indexes, and a **BEFORE INSERT trigger**
  `trg_two_seasons_competitor_rates_insert_as_upsert` that converts a
  conflicting INSERT into an UPDATE of the matching row (manual upsert).
- RLS enabled; the ONLY policy is
  `"Hotel staff can read competitor rates"` — PERMISSIVE, FOR SELECT, TO
  `authenticated`, `USING (is_hotel_staff(auth.uid()))`. No write policies:
  writes work only as `service_role` (bypasses RLS).
- Grants on the table are the **Supabase platform defaults**: all seven
  privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) to
  each of `anon`, `authenticated`, `postgres`, `service_role`, plus USAGE on
  the id sequence to the same four roles. Effective access is constrained by
  RLS deny-by-default, not by the grants. §1 mirrors these grants **exactly, as
  instructed** — the observation that they are blanket defaults is recorded
  here, and hardening them (on either table) is deliberately out of scope.
- An empty `public.competitor_hotel_rates` (0 rows) already exists. This spec
  does **not** reuse it (unknown owner/purpose) and does not touch it.

## Recommended execution order

1. §1 — create the Khaldia table (purely additive, inert until written to).
2. *Operator*: repoint the Al Khaldia workflow at it, and decide the fate of
   the experimental 2S monitor (n8n is out of scope for this spec).
3. §4 — install the writer guard on the 2S table. If installed **before** the
   Khaldia workflow is repointed, that workflow's inserts will fail loudly in
   n8n until step 2 happens — acceptable, but it is a choice; this order avoids it.
4. §2 — quarantine the 105 rows (after the guard, nothing can re-pollute or
   un-flip them).
5. §3 — dashboard pin (any time; defense in depth).

---

## §1 New table: `public.khaldia_competitor_hotel_rates`

Migration file: `supabase/migrations/<ts>_khaldia_competitor_hotel_rates.sql`
with a `<ts>_khaldia_competitor_hotel_rates_rollback.sql` sibling (repo
convention). Applied via MCP `apply_migration` when approved.

```sql
-- Same shape as "Two Seasons Competitor Hotel room Rates", verified column by
-- column against information_schema on 2026-09-02.
create table public.khaldia_competitor_hotel_rates (
  id                        bigserial primary key,
  workflow_id               text not null,
  workflow_name             text,
  execution_id              text,
  generated_at              timestamptz not null,
  report_date               date not null,
  dry_run                   boolean not null default false,
  hotel_name                text not null,
  source_group              text,
  checkin_date              date not null,
  checkout_date             date,
  status                    text not null,
  original_price            numeric,
  original_currency         text,
  converted_price_aed       numeric,
  accor_tax_type            text,
  booking_url               text,
  error_message             text,
  request_id                text,
  is_lowest_for_day         boolean not null default false,
  lowest_price_for_day_aed  numeric,
  summary                   jsonb,
  parser_debug              jsonb,
  raw_result                jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  price_source              text,
  source_kind               text,
  source_label              text,
  constraint khaldia_competitor_rates_status_check check (
    status = any (array['price_found'::text, 'sold_out'::text,
                        'price_not_found'::text, 'scrape_failed'::text,
                        'review_needed'::text])),
  constraint khaldia_competitor_rates_unique_report_row
    unique (workflow_id, report_date, hotel_name, checkin_date)
);

create index khaldia_competitor_rates_checkin_date_idx
  on public.khaldia_competitor_hotel_rates (checkin_date);
create index khaldia_competitor_rates_hotel_date_idx
  on public.khaldia_competitor_hotel_rates (hotel_name, checkin_date);
create index khaldia_competitor_rates_report_date_idx
  on public.khaldia_competitor_hotel_rates (report_date);
create index khaldia_competitor_rates_source_group_idx
  on public.khaldia_competitor_hotel_rates (source_group);
create index khaldia_competitor_rates_status_idx
  on public.khaldia_competitor_hotel_rates (status);

-- The 2S table converts INSERT into UPDATE on its unique key via a BEFORE
-- INSERT trigger; the writers were built against that behaviour, so the
-- Khaldia table gets an identical (table-specific) copy.
create or replace function public.khaldia_competitor_rates_insert_as_upsert()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  update public.khaldia_competitor_hotel_rates
  set
    workflow_name = new.workflow_name,
    execution_id = new.execution_id,
    generated_at = new.generated_at,
    dry_run = new.dry_run,
    source_group = new.source_group,
    checkout_date = new.checkout_date,
    status = new.status,
    original_price = new.original_price,
    original_currency = new.original_currency,
    converted_price_aed = new.converted_price_aed,
    accor_tax_type = new.accor_tax_type,
    booking_url = new.booking_url,
    error_message = new.error_message,
    request_id = new.request_id,
    is_lowest_for_day = new.is_lowest_for_day,
    lowest_price_for_day_aed = new.lowest_price_for_day_aed,
    summary = new.summary,
    parser_debug = new.parser_debug,
    raw_result = new.raw_result,
    updated_at = now()
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

create trigger trg_khaldia_competitor_rates_insert_as_upsert
  before insert on public.khaldia_competitor_hotel_rates
  for each row execute function public.khaldia_competitor_rates_insert_as_upsert();

-- RLS: enabled, read-only for authenticated hotel staff, no write policies —
-- writes happen only as service_role, exactly like the 2S table.
alter table public.khaldia_competitor_hotel_rates enable row level security;

create policy "Hotel staff can read competitor rates"
  on public.khaldia_competitor_hotel_rates
  for select to authenticated
  using (is_hotel_staff(auth.uid()));

-- Grants: byte-for-byte what the 2S table carries today (the platform default
-- set — see §0). Explicit rather than left to default privileges, so the
-- posture is stated in the migration and not an accident of role defaults.
grant select, insert, update, delete, truncate, references, trigger
  on public.khaldia_competitor_hotel_rates to anon, authenticated, service_role;
grant usage on sequence public.khaldia_competitor_hotel_rates_id_seq
  to anon, authenticated, service_role;
```

**Behaviour verification** (repo convention: prove it by probes, not the
catalogue; run as service_role, then clean up):

```sql
-- 1. Writable by service_role, upsert dedupes on the unique key:
insert into public.khaldia_competitor_hotel_rates
  (workflow_id, workflow_name, generated_at, report_date, hotel_name, checkin_date, status, dry_run)
values ('probe', 'probe', now(), current_date, 'Probe Hotel', current_date, 'review_needed', true);
insert into public.khaldia_competitor_hotel_rates
  (workflow_id, workflow_name, generated_at, report_date, hotel_name, checkin_date, status, dry_run)
values ('probe', 'probe-renamed', now(), current_date, 'Probe Hotel', current_date, 'review_needed', true);
select count(*) = 1 as upsert_worked,
       bool_and(workflow_name = 'probe-renamed') as update_path_ran
from public.khaldia_competitor_hotel_rates where workflow_id = 'probe';
-- 2. Invisible to anon (RLS deny-by-default despite the INSERT/SELECT grants):
select set_config('role', 'anon', true);
select count(*) = 0 as anon_sees_nothing from public.khaldia_competitor_hotel_rates;
reset role;
-- 3. Clean up:
delete from public.khaldia_competitor_hotel_rates where workflow_id = 'probe';
```

(Probe rows use `dry_run = true` + `status = 'review_needed'` so that even a
forgotten cleanup is invisible to every reader.)

**Rollback** (`_rollback.sql` sibling):

```sql
drop trigger if exists trg_khaldia_competitor_rates_insert_as_upsert
  on public.khaldia_competitor_hotel_rates;
drop function if exists public.khaldia_competitor_rates_insert_as_upsert();
drop table if exists public.khaldia_competitor_hotel_rates;
```

**What rolling back costs:** every Al Khaldia rate row written after the
workflow was repointed is destroyed with the table. Export first if any real
scraping has happened.

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

**Behaviour verification** (service_role; probes clean up after themselves):

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
| §1 new table | drop trigger + function + table | destroys any real Khaldia data written after repointing — export first |
| §2 quarantine | the reverse UPDATE (expected 105) | none; byte-exact while the guard/redirect holds |
| §3 dashboard pin | `git revert` | page is again exposed to any writer in the table |
| §4 guard | drop trigger + function | table is again open to any service-role writer |

## §6 Out of scope (owned by the operator)

- All n8n edits: repointing the Al Khaldia workflow, the fate of the
  experimental `2S Comp-Set Rate Monitor`, and why the Pro workflow has
  written nothing since 08-27 (six days of silence as of today — worth a look
  while in there).
- The empty legacy `public.competitor_hotel_rates` table (unknown purpose).
- Hardening the blanket default grants on either table.

## §7 What could NOT be determined from the repo or a read-only query

- Whether the Al Khaldia workflow relies on the insert-as-upsert trigger
  semantics. It wrote through a table that has it; §1 mirrors the trigger as
  the safe default.
- Whether Al Khaldia's readers should be the same `is_hotel_staff()` roster.
  §1 mirrors the policy exactly as instructed; if Khaldia data needs a
  different audience, that is a policy decision on the new table.
- Anything inside the n8n workflows themselves (ids/names above are taken from
  what the workflows wrote into the table).
- Why the Pro scraper stopped after 08-27, and why its competitor rows on
  08-27 all carry non-success statuses.
