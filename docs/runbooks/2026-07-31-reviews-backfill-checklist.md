# Reviews backfill — run checklist

**Workflow:** "2S Daily Reviews Combined" (`75YwOjmavJ3gKn9r`), daily 08:00
**Table:** `public."Two Seasons and Reviews"`
**Prepared:** 2026-07-31 · **Run by:** Ahmed (by hand, in the n8n UI)
**Claude did not touch n8n.** Every figure below comes from live SQL against
`yczcebfaqerlwfalrbjn`, dated 2026-07-31.

---

## 1. What you are actually fixing

Two separate problems, both real, both measured.

### (a) Ingestion stalled from March 2026

Deduplicated review counts per month for the three live sources
(`google-maps`, `booking`, `tripadvisor`):

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
tripadvisor 2026-03-30. June 2026 has **no rows at all**.

Against a ~250/month baseline, the missing window is roughly
**2026-03-01 → today, ~1,100 reviews**. Treat that as an order of magnitude,
not a target: some of the drop may be a genuine fall in review volume, and
only the run itself will tell you.

### (b) 47% of the live rows are duplicates

| | rows | genuine | duplicate | % |
|---|---|---|---|---|
| live sources (google-maps + booking + tripadvisor) | 4,050 | 2,141 | **1,909** | **47.1%** |
| legacy capitalised sources (TrustYou import, Nov 2024–Oct 2025) | 3,839 | — | ~2 | ~0% |
| `khaldia_reviews` (separate table) | 405 | 405 | **0** | 0% |

Duplicate key used: `(Source, Author, Date, Text, Score)`. It is a safe key
here, and that is checked rather than assumed:

- Of 1,310 duplicate groups with real review text, **zero** have a differing
  Score inside the group — they are byte-identical reviews, not coincidences.
- The same key finds only **2** duplicates in 2,755 legacy rows with text, so
  the key is not manufacturing false positives.
- 32 groups differ only in `URL`, and 5 blank-text groups differ in Score.
  Adding Score to the key already spares those 5; the 32 are noted below.

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

## 2. Three preconditions — check these BEFORE you run anything

### P1. Is the insert node pointing at a table that exists? (check first)

Open `Create Review Row` and read its **Table** field. It must be
`Two Seasons and Reviews`.

Why this is first: the sweep recorded that node's target as **`reviews`**, and
there is **no `reviews` relation anywhere in the database** — the current
table's primary key is still named `reviews_pkey`, which means the table was
renamed to `Two Seasons and Reviews` at some point. If the node still says
`reviews`, every insert fails with a missing-relation error, the masked
`onError` reports success, and the run looks perfect while writing nothing.

Caveat: "table reviews" in that sweep may have been my own shorthand rather
than the literal field value — I read the workflow from a Postgres dump, not
the UI. Thirty seconds in the UI settles it. If it *is* wrong, that is the
real fix and the backfill is just the recovery.

### P2. The dedup lookup cannot cover a five-month backfill

`Get Recent Existing Reviews` reads through PostgREST, which clamps every
response to **1,000 rows** (`api.max_rows`, `supabase/config.toml:8`). The
table holds **7,889**. If that node fetches "recent" rows by date or by a
fixed limit, it structurally cannot see March–May rows, so the backfill will
re-insert reviews that are already there.

Two ways forward. **Take the second one:**

1. Widen the lookup to page over the backfill window (`.range()`, 1,000 at a
   time, selecting only Source/Author/Date/Score). Correct, but it is real
   surgery on a workflow you just fixed.
2. **Let it duplicate, then dedup with SQL afterwards** (§5). Simpler, and the
   result is verifiable by counting rather than by trusting a lookup. You are
   already cleaning 1,909 existing duplicates in the same pass, so the extra
   ones cost nothing.

### P3. Un-mask both nodes for this run

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

Expected right now: `7889 | 4050 | 2026-07-29 | 2026-05-18 | 2026-03-30`.

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

## 5. Dedup — dry run first, then the delete

Scoped to the three live sources only. The legacy capitalised sources are a
clean one-off historical import and must not be touched.

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

Before any backfill this returns **1909**. After the backfill it will be
larger — 1909 plus whatever the run re-inserted.

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

- **The dashboard numbers will drop, visibly.** `useReviewsInsights` reports
  `total: rows.length` with no dedup, and Sera's reviews tool reads the same
  table, so review totals for Sep 2025 – Feb 2026 are currently inflated by
  ~47%. After the delete they fall to the true figure. That is a correction,
  not a regression — but if anyone screenshots a KPI this week, note the date.
- **The 32 URL-differing groups.** Those groups have identical
  Source/Author/Date/Text/Score but two different URLs. Almost certainly the
  same review captured under two URL formats; the delete keeps the lowest id,
  so it keeps the older URL form. If you would rather inspect them first:

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
  `Orbitz`) — 3,839 rows, Nov 2024 – Oct 2025, essentially duplicate-free.
- **Do not** touch `khaldia_reviews` — 405 rows, 0 duplicates, current to
  today. That workflow is healthy. (It does still carry the same masked-node
  defects per the sweep; that is a separate, already-reported item.)
- **Do not** add a unique index on the dedup key yet. It would stop this
  recurring, but if `Create Review Row` does a plain insert rather than an
  upsert, the index turns every re-seen review into a hard error — and with
  masking on, into another silent stall. Dedup first, decide the constraint
  separately, and pair it with an upsert.

---

## 7. What to report back

1. P1: what `Create Review Row`'s Table field actually said.
2. The before/after output of the §4 query.
3. Whether June 2026 is still empty.
4. The dry-run count before and after the delete.

That is enough to tell whether the pipeline is fixed, or merely quieter.
