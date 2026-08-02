# Hotel Training — performance plan

Started 2026-08-02. Baseline and method: [docs/perf/hotel-training-baseline.md](../../perf/hotel-training-baseline.md).

The page felt slow. The measurement says why, and it is not what it looked like:

- **The three data reads are ~3.5 s of cold start, not SharePoint work.** On one
  load `sp-read-trainers` served from its own in-memory cache — never called
  Graph — and still took 2474 ms. A trivial control function (`whatsapp-control-status`)
  costs 253–283 ms warm and 2142–2548 ms cold. The cost is the isolate, not the query.
- **The page then blocked on the slowest of the three.** One gate,
  `colleaguesLoading || columnsLoading || trainersLoading`, blanked the whole
  wizard until all three answered: 3.5–3.8 s typically, 15.7 s once.
- **6 of 7 first-party responses carry no `Cache-Control` at all.** A warm reload
  transfers 224.4 KB, of which 222.5 KB is one logo PNG re-downloaded in full.

So the work splits into three independent tracks: stop waiting for data that is
not needed yet (1.1), stop paying cold start on the critical path (1.4, 2), and
let the browser keep what it already has (1.2, 1.3, 3).

## Phase 0 — baseline ✅ `2a4ad61`

`scripts/measure-page-baseline.mjs` (repeatable, Resource Timing based) plus the
edge-function log table. Chrome DevTools MCP wired up via
`scripts/chrome-devtools-mcp.sh`, which resolves the newest Playwright Chromium
at launch rather than pinning a version that the next `playwright install` retires.

## Phase 1.1 — step 1 renders before any read lands ✅ `6752404`

`placeholderData` on `useListColumns`/`useTrainers`, page-wide gate removed, only
step 2 waits. Guard test holds all three reads open for 15 s and asserts step 1 is
*usable* — both pickers opened and their options read — not merely present.

Mutation-proved live: the same test failed on chromium and mobile-chrome when only
the source changes were absent, and passes on both with them.

## Phase 1.4 — cache the Graph app token ✅ `23a8d0d`

Every sp-* function called `getAppToken()` on every request: a full
`login.microsoftonline.com` round trip before any Graph call. Tokens are valid
for ~1 h and are identical for every caller. Now a module-level `TokenCache`
(`_shared/token-cache.ts`, pure so `node --test` can reach it), expiring on
`expires_in` minus a 5-minute margin, with `graphFetch` clearing it on 401 so a
rotated client secret is still picked up on the next request.

Helps all six sp-* functions and `training-report`, and it is the only change here
that shortens a *cold* request as well as a warm one.

**Not live until the functions are redeployed** —
`bash scripts/deploy-sp-function.sh --all`.

## Phase 1.2 — cacheable read responses ✅ decided, not built

**Reframed after checking.** The original plan was `Cache-Control` on the three
`sp-read-*` responses. That would have done nothing: `supabase.functions.invoke`
issues **POST** (`node_modules/@supabase/functions-js/.../FunctionsClient.js`,
`method: method || 'POST'`), and no browser caches a POST response. The header
would have been measurably absent from every DevTools cache column while looking
correct in the source.

Two ways to actually get a cache:

1. Switch the three reads to `invoke(name, { method: 'GET' })` and set
   `Cache-Control: private, max-age=...`. Real browser caching, but it changes the
   function contract and only helps a reload — the first visit still pays cold start.
2. Serve the data from Postgres instead (Phase 2). PostgREST is always warm, so
   the first visit is helped too, and React Query persistence (Phase 3) covers
   reloads without any HTTP cache at all.

Phase 2 + Phase 3 subsume option 1. Do those; keep this section as the record of
why the header was not added.

## Phase 1.3 — let the browser keep the assets ✅ `f555ebc`, `ae2ebc2`

nginx does **not** serve the files — it proxies to `serve dist -l 3007 -s` under
PM2. So the missing `Cache-Control` is `serve`'s default, not an nginx bug (a
conditional `curl` with the ETag does return 304/0 bytes).

Fix at the app layer, in version control: `public/serve.json` with
`public, max-age=31536000, immutable` for `/assets/*` (content-hashed filenames
exist precisely for this) and `no-cache` for `index.html`. Vite copies `public/*`
into `dist/`, which is what `serve` reads. `serve` merges `serve.json` with CLI
flags — `--single` *appends* to `rewrites` rather than replacing the config
(`/usr/lib/node_modules/serve/build/main.js`), so `-s` keeps working.

An nginx `location /assets/ { add_header ... }` would also work but would live
outside the repo — the same drift B3 records for the auth config — and
`add_header` in a new location silently drops every inherited security header
from `global_settings`.

Both logos were also stored at ~815×700 and drawn into boxes no larger than
56 CSS px. Downscaled to 256 px on the long edge and recompressed in place, so no
import changed: 227.5 KB → 29.5 KB and 247.7 KB → 25.7 KB.

Two guards, since both failures are invisible in review:
`tests/unit/serve-config-valid.test.ts` (an invalid `serve.json` stops `serve`
booting — it takes the site down rather than degrading caching, and the first
draft's `$comment` keys were rejected by ajv) and
`tests/unit/asset-budget.test.ts` (48 KB per file in `src/assets`).

**Not live until `bash scripts/deploy-frontend.sh` runs** — that script exists
mainly to enforce the `pm2 restart`, without which the headers silently stay old.

## Phase 2 — read the lists from Postgres, not from Graph ✅ `fce858e`, `c81ab48`, `b0fa4e0`

The real fix for the 3.5 s. `public.sharepoint_mirror` holds one jsonb row per
dataset; the frontend reads it and only falls back to the edge function when the
row is absent or stale.

Write-through rather than pg_cron: each `sp-read-*` upserts its result on every
successful Graph read. No new secret, no duplicated Graph logic, no scheduler to
fail silently, and it degrades to exactly today's behaviour when the mirror is
empty.

Three decisions that turned out to matter more than the table itself:

- **`fetched_at` is stamped by a trigger, not by the writer.** PostgREST's upsert
  only updates the columns in the request body, so a writer sending
  `{key, payload}` would freeze `fetched_at` at the first insert — a permanently
  stale mirror that looks perfectly healthy.
- **`sp-manage-colleague` deletes the `colleagues` row** after every successful
  add/edit/deactivate. Without it, the three forms' existing
  `invalidateQueries(['colleagues'])` would re-read the mirror and show the list
  from *before* the change: the member just added would not appear, and
  refreshing would not help until the TTL expired.
- **The mirror write can never fail a read.** `writeMirror` swallows and logs its
  own failures, and `readMirror` returns null for every reason at all. A mirror
  problem degrades performance, never correctness.

Access proved from both sides, by behaviour rather than by catalogue:

| Acting as | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `anon`, via live REST with the published key | 401 / 42501 | 401 / 42501 |
| `authenticated`, `set local role` with RLS on | 1 row, payload readable | all refused, `insufficient_privilege` |
| `service_role` | yes | yes — the only writer |

The `authenticated` SELECT check matters as much as the refusals: if it had been
blocked, the mirror would simply never be used after deploy, and the only symptom
would be no speed-up at all.

**Not live until `bash scripts/deploy-sp-function.sh --all` runs.**

## Phase 3 — the entry bundle ✅ `c04820e`

The three items here were written as "do these last and only if the re-measure
still shows them mattering". Measuring changed what the work was.

### What the entry chunk actually contained

A diagnostic build that gave every npm package its own chunk (into `dist-test`,
never `dist`) named the real cost, and it was not chunk grouping:

| Package | Built size |
|---|---|
| pdfjs-dist | 372.6 KB |
| emoji-picker-react | 297.3 KB |
| recharts | 274.6 KB |
| mammoth | 148.3 KB |
| dingbat-to-unicode | 117.2 KB |
| react-dom | 126.8 KB |
| bluebird | 83.4 KB |
| @xmldom/xmldom | 58.5 KB |
| xmlbuilder | 43.4 KB |

`emoji-picker-react` and `recharts` were already in lazy route chunks. But
**pdfjs-dist and mammoth's whole tree — about 820 KB — were in the entry chunk**,
downloaded before anything renders, including on `/auth` where no document can be
uploaded at all. The chain was
`App → DashboardShell → RightChatPanel → useChat → useFileUpload →
enhancedFileUploadHandler → clientSideDocumentProcessor`.

Two of those three edges existed only to carry an **interface**. `import { ProcessingProgress }`
rather than `import type { ProcessingProgress }` is a value import, so the module
loads for its side effects. The third needed the class itself, and became an
`await import()` inside the one function that uses it — by which point the user has
already chosen a file.

**Entry chunk 1537 kB → 659 kB, gzip 443 → 200 kB.** The parser is now an 877 kB
chunk fetched only on upload.

### The vendor split

Then `manualChunks` for `react`/`@radix-ui`/`@supabase` only, with `undefined`
returned for everything else: a 283 kB entry plus 426 kB of vendor code that an
application change does not invalidate. Costs ~14 kB gzip on a first visit, saves
~115 kB gzip on every visit after a deploy, given the `immutable` headers from
Phase 1.3.

The first attempt at this used a catch-all `return 'vendor'`. It made first load
worse (1638 kB eager, above the unsplit 1537 kB) **and** crashed the built app with
`Cannot access 'P' before initialization` — and every gate was green, because
nothing in the suite had ever loaded a production bundle. `PW_BUILD=1` now exists
so it can. See `docs/testing-lessons.md` §10.

### Not done, and why

- **React Query persistence to localStorage** — dropped. With the mirror serving
  in ~100 ms it would save ~100 ms, needs a new dependency, and would change
  staleness behaviour for every query in the app including pages that must stay
  byte-identical. The cost is app-wide and the benefit is one page.
- **Prefetch on navigation intent** — dropped. It was designed to hide a 3.5 s
  wait. Phase 1.1 means step 1 renders with no network at all, and Phase 2 means
  colleagues arrive in ~100 ms while the user is still typing into step 1. There is
  no longer a wait to hide, and it would mean restructuring three hooks to expose
  their query options plus a special case in `AppSidebar` for one route.

## Environment note

Something outside the repo runs a `dist` swap (`dist-new/` → `dist.bak-<ts>/`)
and leaves `reset: moving to HEAD` in the HEAD reflog; the working tree goes clean
and then comes back. No script in `scripts/`, no root crontab entry and no
`refs/stash` accounts for it. It cost this work one confused hour across two
sessions. It cannot touch committed work, so the mitigation is to commit each
phase as soon as its gates pass rather than batching.
