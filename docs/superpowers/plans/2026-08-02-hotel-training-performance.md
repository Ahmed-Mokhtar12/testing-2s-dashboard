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

## Phase 1.4 — cache the Graph app token

Every sp-* function calls `getAppToken()` on every request: a full
`login.microsoftonline.com` round trip before any Graph call. Tokens are valid
for ~1 h; nothing re-uses them. Module-level cache keyed on nothing (one app, one
scope), expiring on `expires_in` minus a safety margin.

Helps all six sp-* functions and `training-report`, and it is the only change here
that shortens a *cold* request as well as a warm one.

## Phase 1.2 — cacheable read responses

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

## Phase 1.3 — let the browser keep the assets

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

Separately: `two-seasons-logo-full.png` is 227 KB at 815×699 for a logo drawn at
a fraction of that. Recompress in place so no import changes.

## Phase 2 — read the lists from Postgres, not from Graph

The real fix for the 3.5 s. Mirror the three read results into Postgres and have
the frontend read the mirror; the edge functions keep talking to Graph but on a
schedule, off the critical path.

Write-through rather than pg_cron: each `sp-read-*` upserts its result into the
mirror on every successful Graph read. No new secret, no duplicated Graph logic,
no scheduler to fail silently, and it degrades to exactly today's behaviour when
the mirror is empty.

Frontend: read the mirror first; if a row exists, render from it and revalidate
in the background; if not, fall back to invoking the function and awaiting it.

## Phase 3 — keep what the browser already fetched

- React Query persistence to localStorage, so a reload renders from the last
  known-good data instead of refetching.
- Prefetch the three queries on navigation intent (hover/focus of the sidebar
  link), so the fetch starts before the route mounts.
- `manualChunks` — the 433 KB (1505 KB decoded) main bundle is downloaded before
  anything renders, on every route including `/auth`.

Do these last and only if the re-measure still shows them mattering.

## Environment note

Something outside the repo runs a `dist` swap (`dist-new/` → `dist.bak-<ts>/`)
and leaves `reset: moving to HEAD` in the HEAD reflog; the working tree goes clean
and then comes back. No script in `scripts/`, no root crontab entry and no
`refs/stash` accounts for it. It cost this work one confused hour across two
sessions. It cannot touch committed work, so the mitigation is to commit each
phase as soon as its gates pass rather than batching.
