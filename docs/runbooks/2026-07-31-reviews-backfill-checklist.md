# Reviews backfill — run checklist

**Workflow:** "2S Daily Reviews Combined" (`75YwOjmavJ3gKn9r`), daily 08:00
**Table:** `public."Two Seasons and Reviews"`
**Prepared:** 2026-07-31 · **Run by:** Ahmed (by hand, in the n8n UI)
**Claude did not touch n8n.** Every figure below comes from live SQL against
`yczcebfaqerlwfalrbjn`.

---

## 0. STATUS — updated 2026-07-31, evening

Two of the three preconditions are now **settled**, and the dedup is **done**.
Read this section before anything below it; several figures in §1–§5 were
written against the pre-dedup table and are corrected here.

| Item | State |
|---|---|
| **P1** — is `Create Review Row` pointing at a real table? | **SATISFIED.** Ahmed read both nodes in the n8n UI: they target `Two Seasons and Reviews`. The live manual run then inserted row 7889, which a missing-relation 404 could not have done. The sweep's "table `reviews`" was shorthand, as §2 P1 suspected. |
| **P2** — the dedup lookup cannot cover five months | **STILL TRUE.** Unchanged by the dedup; the PostgREST 1,000-row clamp is a property of the read, not of the row count. Plan (2) below still applies. |
| **P3** — un-mask both nodes for the run | **STILL TO DO.** |
| **Dedup of the existing duplicates** | **DONE**, by Ahmed, via SQL, before the backfill. 7,889 → **5,954** rows, 1,935 deleted, 0 remaining on the delete key. |

**The table is now 5,954 rows, overall average Score 4.4262** (was 7,889 /
4.4643). Anywhere a figure of 7,888 / 7,889 / 4.46 appears in older notes, it
is pre-dedup.

### The two counts reconcile exactly — it was scope, not disagreement

Ahmed measured 1,935 duplicates of 7,889; this runbook said 1,909 of 4,050.
Re-measured against `reviews_backup_20260731` (the pre-delete snapshot), per
source, on the same key `(Source, Author, Date, Text, Score)`:

| Source | rows before | duplicate excess | rows now | deleted |
|---|---|---|---|---|
| `google-maps` | 2,486 | 1,161 | 1,325 | 1,161 |
| `booking` | 1,236 | 594 | 642 | 594 |
| `tripadvisor` | 328 | 154 | 174 | 154 |
| **live-source subtotal** | **4,050** | **1,909** | **2,141** | **1,909** |
| `Booking.com` (legacy) | 1,079 | 26 | 1,053 | 26 |
| 11 other legacy sources | 2,760 | 0 | 2,760 | 0 |
| **total** | **7,889** | **1,935** | **5,954** | **1,935** |

1,909 + 26 = 1,935. This runbook scoped its count to the three live Apify
sources; the DELETE ran unscoped and additionally cleaned 26 duplicates that
had been sitting in the legacy `Booking.com` import since before the workflow
existed. No disagreement about what counts as a duplicate.

Two things this table also proves, which are worth more than the
reconciliation itself:

- **`deleted` equals `duplicate excess` for every single source, including 0
  for the eleven that had none.** The DELETE removed exactly the excess and
  nothing else — no over-deletion, no collateral row.
- The earlier claim "the same key finds only ~2 duplicates in the legacy rows"
  was **too low**: it is 26, all in `Booking.com`. The eleven other legacy
  sources are genuinely at zero.

### Residual: 160 duplicates the delete key cannot see, by construction

`Source` is part of the dedup key, so two copies of the same review filed
under two different **source labels** are invisible to it. Google is present
under both `google-maps` (Apify) and `Google` (legacy TrustYou export), and
they overlap:

- **160 groups**, each with the same `Author`, `Date`, `Text` and `Score` under
  both labels — **160 surplus rows**, 2.7% of the current table.
- All 160 have **non-empty review text**, averaging 155 characters. Identical
  155-character text plus identical author, date and score is not coincidence.
- All of them fall in **2025-07-06 → 2025-10-31**, exactly the window where the
  legacy export and the Apify scrape overlap. Outside that window there are
  none, which is what you would expect from a label seam rather than a bug.
- `booking`/`Booking.com` and `tripadvisor`/`TripAdvisor` have **zero**
  cross-label pairs, so this is Google-only.

**Not deleted — that is Ahmed's call, same as the first one.** If you do want
them gone, dry run first:

```sql
-- dry run: how many, and which ones
with g as (
  select "Author","Date","Text","Score", min(id) as keep_id, count(*) as copies
  from public."Two Seasons and Reviews"
  where lower("Source") in ('google','google-maps')
  group by 1,2,3,4
  having count(distinct lower("Source")) > 1
)
select count(*) as groups, sum(copies - 1) as rows_that_would_go from g;
```

Then the delete:

```sql
delete from public."Two Seasons and Reviews" t
using (
  select "Author","Date","Text","Score", min(id) as keep_id
  from public."Two Seasons and Reviews"
  where lower("Source") in ('google','google-maps')
  group by 1,2,3,4
  having count(distinct lower("Source")) > 1
) g
where lower(t."Source") in ('google','google-maps')
  and t."Author" = g."Author" and t."Date" = g."Date"
  and t."Text" is not distinct from g."Text"
  and t."Score" is not distinct from g."Score"
  and t.id <> g.keep_id;
```

Effect, computed rather than estimated: **5,954 → 5,794 rows, average Score
4.4262 → 4.4192.** `min(id)` keeps the older row, which for this window is the
legacy `Google` copy.

Worth deciding **before** the backfill, not after: the backfill re-scrapes
Google from 2026-03-01, so it cannot create new rows in the 2025 window this
affects — but doing it now keeps "how many rows should there be" a single
answer instead of two.

### The pre-delete snapshot, and when to drop it

`public.reviews_backup_20260731` — 7,889 rows, the exact pre-delete state.

- **RLS is now enabled** on it, with **zero policies**, verified
  (`relrowsecurity = true`, `policies = 0`). That is deny-all for `anon` and
  `authenticated`, which is correct for a static snapshot nothing writes to.
  It was created with `CREATE TABLE AS`, which does **not** inherit RLS — that
  is why it was briefly world-readable, including guest names and review text.
  Worth remembering for the next snapshot: `CREATE TABLE AS` always starts
  unprotected.
- **Restore path**, if the dedup ever needs undoing:

```sql
begin;
delete from public."Two Seasons and Reviews";
insert into public."Two Seasons and Reviews"
  select * from public.reviews_backup_20260731;
-- check the count is 7889 before you commit
select count(*) from public."Two Seasons and Reviews";
commit;
```

  Wrapped in a transaction on purpose: an interrupted restore between the
  DELETE and the INSERT would leave the live table empty.
- **DROP REMINDER — 2026-08-14** (two weeks). Ahmed asked to be reminded:
  ```sql
  drop table public.reviews_backup_20260731;
  ```
  Keep it until the backfill has run and the numbers have been sanity-checked
  for a few days; a snapshot is only useful while you might still want it.
  **That condition is not met as of 2026-08-04** — the backfill has not run — so
  the 14th is when to re-read this, not a date to drop on.

  **This is no longer the only live snapshot table.** `docs/backlog.md` **B10**
  lists both this one and `training_participants_ws_backfill_20260804` with
  their separate conditions, and is the single place to look; it exists because
  two snapshots on different clocks is how one gets forgotten. Their dates are
  deliberately **not** coupled — this table waits on the backfill, that one
  waits on nothing.

---

## 1. What you are actually fixing

Two separate problems, both real, both measured. Problem (b) is now fixed —
kept here because it is the evidence for why the workflow, not the source, was
at fault.

### (a) Ingestion stalled from March 2026 — STILL OPEN, this is the backfill

Deduplicated review counts per month for the three live sources
(`google-maps`, `booking`, `tripadvisor`). These were already deduplicated when
first measured, so the 2026-07-31 DELETE did **not** change them:

| Month | google-maps | booking | tripadvisor | total |
|---|---|---|---|---|
| 2025-09 | 110 | 60 | 35 | 205 |
| 2025-10 | 137 | 80 | 32 | 249 |
| 2025-11 | 377 | 104 | 33 | 514 |
| 2025-12 | 149 | 41 | 24 | 214 |
| 2026-01 | 238 | 92 | 16 | 346 |
| 2026-02 | 146 | 104 | 7 | 257 |
| **2026-03** | **33** | **18** | **1** | **52** |
| **2026-04** | **20** | **22** | **0** | **42** |
| **2026-05** | **7** | **15** | **0** | **22** |
| **2026-06** | **0** | **0** | **0** | **0** |
| **2026-07** | **1** | **0** | **0** | **1** |

Last review present per source: google-maps 2026-07-29, booking 2026-05-18,
tripadvisor 2026-03-30 — all three unchanged by the dedup (the delete keeps one
row per group, so a max date can never move). June 2026 has **no rows at all**.

Against a ~250/month baseline, the missing window is roughly
**2026-03-01 → today, ~1,100 reviews**. Treat that as an order of magnitude,
not a target: some of the drop may be a genuine fall in review volume, and
only the run itself will tell you.

### (b) 47% of the live rows were duplicates — FIXED 2026-07-31

| | rows | genuine | duplicate | % |
|---|---|---|---|---|
| live sources (google-maps + booking + tripadvisor) | 4,050 | 2,141 | **1,909** | **47.1%** |
| legacy capitalised sources (TrustYou import, Nov 2024–Oct 2025) | 3,839 | 3,813 | 26 | 0.7% |
| `khaldia_reviews` (separate table) | 405 | 405 | **0** | 0% |

Duplicate key used: `(Source, Author, Date, Text, Score)`. It was a safe key
here, and that was checked rather than assumed:

- Of 1,310 duplicate groups with real review text, **zero** had a differing
  Score inside the group — byte-identical reviews, not coincidences.
- Ahmed's independent check found the mechanism directly: id blocks 4184–4192
  and 5446–5454 were identical row-for-row **in the same order** — whole
  scrape batches re-inserted, not individual near-matches.
- The key found only 26 duplicates in 3,839 legacy rows, all in one source, so
  it was not manufacturing false positives.
- 32 groups differed only in `URL`, and 5 blank-text groups differed in Score.
  Adding Score to the key already spared those 5.

**Stated limit, not hidden:** of the 1,935 deleted rows, 1,334 had
byte-identical review text and are unambiguous. The other 601 were score-only
rows with no text, where the key cannot distinguish two guests sharing a first
name on the same date from one guest inserted twice. The batch-re-insertion
evidence covers them as a class, and the effect on the average is negligible
(4.4643 → 4.4262 overall, and the duplication was *flattering* the score, so
the correction moves it down, not up).

The contrast with `khaldia_reviews` — same Apify actor, same shape, **zero**
duplicates, ingesting cleanly through today — is what pins the cause to this
workflow rather than to the data source.

### (c) Why, per the n8n sweep of 2026-07-25

`docs/n8n-resilience-sweep-2026-07-30.md` recorded both defects on this
workflow before you fixed it on 2026-07-30:

- `Get Recent Existing Reviews` (supabase) — ERROR-MASKING → "dedup lookup
  failure → all reviews treated as new → duplicates inserted". That is
  finding (b).
- `Create Review Row` (supabase, terminal) — ERROR-MASKING → "failed inserts
  masked as success → silent multi-week data loss". That is finding (a).

So the mechanism was already documented; what is new here is the size of it.

---

## 2. Preconditions

### P1. Is the insert node pointing at a table that exists? — SATISFIED

Both nodes target `Two Seasons and Reviews`, read from the n8n UI on
2026-07-30, and the live manual run inserted row 7889. Nothing to do. (The
original worry: the sweep read a Postgres dump and recorded the target as
`reviews`, and no `reviews` relation exists — the live table's primary key is
still named `reviews_pkey`, so it *was* renamed at some point. The dump
reading was shorthand. Keep the reflex, though: a masked insert against a
missing relation is indistinguishable from a quiet day.)

### P2. The dedup lookup cannot cover a five-month backfill — STILL TRUE

`Get Recent Existing Reviews` reads through PostgREST, which clamps every
response to **1,000 rows** (`api.max_rows`, `supabase/config.toml:8`). The
table holds **5,954** (was 7,889 — the dedup does not help here; 5,954 is
still nearly 6× the clamp). If that node fetches "recent" rows by date or by a
fixed limit, it structurally cannot see March–May rows, so the backfill will
re-insert reviews that are already there.

Two ways forward. **Take the second one:**

1. Widen the lookup to page over the backfill window (`.range()`, 1,000 at a
   time, selecting only Source/Author/Date/Score). Correct, but it is real
   surgery on a workflow you just fixed.
2. **Let it duplicate, then dedup with SQL afterwards** (§5). Simpler, and the
   result is verifiable by counting rather than by trusting a lookup. The SQL
   is now proven — it has been run once on this exact table.

### P3. Un-mask both nodes for this run — STILL TO DO

Set `Get Recent Existing Reviews` and `Create Review Row` to **Stop On Error**
(not "Continue") for the backfill run. Otherwise a failing insert reports
success and you cannot tell "0 new reviews found" from "every insert failed" —
which is exactly how five months went missing. Restore the setting afterwards
if you prefer, though leaving them loud is better.

---

## 3. Apify parameters

Actor: `tri_angle~hotel-review-aggregator` (endpoint
`api.apify.com/v2/acts/.../run-sync-get-dataset-items`).

**Copy the daily run's input JSON and change only these:**

| Setting | Value for the backfill | Why |
|---|---|---|
| Date floor / `oldestReviewDate` (or equivalent) | **2026-03-01** | first month that went bad; February is intact |
| Date ceiling | none / today | catch up to now in one pass |
| Max reviews per platform | **≥ 1,500** (not the daily value) | the daily cap is sized for one day; ~1,100 are expected in total, so leave headroom |
| Platforms | google **+** booking **+** tripadvisor | tripadvisor has been dead since 2026-03-30 and booking since 2026-05-18 |
| Hotel identifiers / URLs | **copy verbatim from the daily node** | do not retype — a wrong id silently returns an empty set |
| HTTP timeout | keep the one you set on 2026-07-30 | a `run-sync` hang with no timeout is what froze it before |
| Retries | leave as-is | with a timeout set, retry now works |

I cannot name that actor's exact input keys — I have not seen its schema and I
did not open n8n. The field names above are the roles to fill, not literal
keys; the daily run's own input is the authority on spelling.

---

## 4. Before / after SQL

**Run this before the backfill and keep the output:**

```sql
select
  count(*)                                                as total_rows,
  count(*) filter (where "Source" in ('google-maps','booking','tripadvisor')) as live_rows,
  max("Date") filter (where "Source" = 'google-maps')     as last_google_maps,
  max("Date") filter (where "Source" = 'booking')         as last_booking,
  max("Date") filter (where "Source" = 'tripadvisor')     as last_tripadvisor
from public."Two Seasons and Reviews";
```

Expected right now, **post-dedup, verified 2026-07-31 evening**:
`5954 | 2141 | 2026-07-29 | 2026-05-18 | 2026-03-30`.

(Pre-dedup this line read `7889 | 4050 | …`. If you see 7,889, you are querying
`reviews_backup_20260731`, not the live table.)

**Run the same query after.** Then this, for the shape of what arrived:

```sql
select to_char("Date",'YYYY-MM') as month, "Source", count(*) as rows
from public."Two Seasons and Reviews"
where "Source" in ('google-maps','booking','tripadvisor') and "Date" >= '2026-03-01'
group by 1,2 order by 1,2;
```

A healthy result has all three sources present in every month from 2026-03 to
2026-07, with monthly totals in the low hundreds. **June must stop being
empty** — that is the single clearest pass/fail signal.

---

## 5. Dedup after the backfill — dry run first, then the delete

The existing duplicates are already gone; this section is now only for what the
**backfill itself** re-inserts (see P2 — it will re-insert, by design).

Scoped to the three live sources only. The legacy capitalised sources are a
clean one-off historical import and must not be touched — with the one
exception already handled: the 26 `Booking.com` duplicates the unscoped DELETE
took out on 2026-07-31.

**Dry run (changes nothing):**

```sql
with ranked as (
  select id, row_number() over (
    partition by "Source","Author","Date","Text","Score" order by id
  ) as rn
  from public."Two Seasons and Reviews"
  where "Source" in ('google-maps','booking','tripadvisor')
)
select count(*) as rows_that_would_be_deleted from ranked where rn > 1;
```

**Right now this returns 0** (verified). Before the dedup it returned 1909.
After the backfill it will return however many rows the run re-inserted — and
that number is itself useful: it tells you how blind the dedup lookup was.

**The delete (keeps the lowest id in each group):**

```sql
delete from public."Two Seasons and Reviews"
where id in (
  select id from (
    select id, row_number() over (
      partition by "Source","Author","Date","Text","Score" order by id
    ) as rn
    from public."Two Seasons and Reviews"
    where "Source" in ('google-maps','booking','tripadvisor')
  ) r where rn > 1
);
```

Run the dry run again afterwards; it must return 0.

**Two things to know before you run it:**

- **The dashboard numbers already dropped.** `useReviewsInsights` reports
  `total: rows.length` with no dedup, and Sera's reviews tool reads the same
  table, so review totals for Sep 2025 – Feb 2026 were inflated by ~47% and are
  now correct. If anyone screenshotted a KPI before 2026-07-31 and compares,
  the drop is the correction, not a regression. Sera and the dashboard now
  report **5,954 / 4.43**.
- **The 32 URL-differing groups** had identical
  Source/Author/Date/Text/Score but two different URLs. Almost certainly the
  same review captured under two URL formats; the delete keeps the lowest id,
  so it kept the older URL form. To inspect what survives:

```sql
select "Source","Author","Date",left("Text",60) as text_start,
       string_agg(distinct "URL", E'\n') as urls, count(*) as copies
from public."Two Seasons and Reviews"
where "Source" in ('google-maps','booking','tripadvisor')
group by 1,2,3,4 having count(distinct coalesce("URL",'~')) > 1
order by 6 desc limit 32;
```

---

## 6. Do not

- **Do not** touch the 12 capitalised legacy sources (`Google`,
  `Booking.com`, `TrustYou Survey`, `TripAdvisor`, `Agoda`, `Ctrip`,
  `trip.com`, `Expedia`, `Hotels.com`, `HolidayCheck`, `TOPHotels.ru`,
  `Orbitz`) — 3,813 rows after the 26-row cleanup, Nov 2024 – Oct 2025,
  now duplicate-free on the delete key. The one open question about them is the
  160 cross-label Google pairs in §0, which is a decision, not a defect.
- **Do not** touch `khaldia_reviews` — 405 rows, 0 duplicates, current to
  today. That workflow is healthy. (It does still carry the same masked-node
  defects per the sweep; that is a separate, already-reported item.)
- **Do not** add a unique index on the dedup key yet. It would stop this
  recurring, but if `Create Review Row` does a plain insert rather than an
  upsert, the index turns every re-seen review into a hard error — and with
  masking on, into another silent stall. Decide the constraint separately, and
  pair it with an upsert.
- **Do not** drop `reviews_backup_20260731` before the backfill has run and
  settled. Target date 2026-08-14 (§0).

---

## 7. What to report back

1. The before/after output of the §4 query.
2. Whether June 2026 is still empty.
3. The §5 dry-run count after the backfill — i.e. how many rows the run
   re-inserted that were already there.
4. Whether you also want the 160 cross-label Google duplicates removed (§0).

That is enough to tell whether the pipeline is fixed, or merely quieter.

P1 is answered and needs no further report.
