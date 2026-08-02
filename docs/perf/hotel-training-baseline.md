# Hotel Training — performance baseline

Measured **2026-08-02** against `https://testing-2s-dashboard.digitlab.ai`, before
any optimisation. This file exists so a later "it feels faster" can be checked
against numbers taken the same way.

Reproduce:

```
node scripts/measure-page-baseline.mjs --warm
```

Authenticated variant (operator only — the three data calls never fire without a
session, so an anonymous run cannot see them):

```
SB_SESSION_JSON='<sb-yczcebfaqerlwfalrbjn-auth-token from your browser>' \
  node scripts/measure-page-baseline.mjs --warm
```

## Browser-side, anonymous run

`/dashboard/hotel-training` redirects to `/auth` without a session, so these
numbers cover the shell, the CSS, the fonts and the **main JS bundle** — which is
downloaded either way, and is the floor under any dashboard page.

Bytes below are Resource Timing `transferSize` — what actually crossed the
network. See "A measurement correction" at the end of this file for why that
distinction matters.

| | Cold cache | Warm reload |
|---|---|---|
| TTFB | 261 ms | 7 ms |
| **First Contentful Paint** | **2160 ms** | 248 ms |
| DOMContentLoaded | 1957 ms | 222 ms |
| load event | 2007 ms | 223 ms |
| **Total over the wire** | **674.9 KB** | **224.4 KB** |
| Resources fully downloaded | 6 | **2** |
| Resources revalidated (304, a round trip each) | 1 | 4 |
| Resources served from cache (no network) | 0 | 1 |
| `/assets/*` responses with no `Cache-Control` | 6 | 6 |

Largest, by bytes actually transferred (cold):

| Wire | Decoded | Encoding | `Cache-Control` | Resource |
|---|---|---|---|---|
| 433.0 KB | 1505.0 KB | br | **none** | `/assets/index-zQSInXgV.js` |
| 222.5 KB | 222.2 KB | br | **none** | `/assets/two-seasons-logo-full-*.png` |
| 13.3 KB | 70.6 KB | br | **none** | `/assets/index-*.css` |
| 4.2 KB | 10.3 KB | br | **none** | `/assets/Auth-*.js` |
| 0.9 KB | 7.6 KB | gzip | `private, max-age=86400` | fonts.googleapis.com CSS |

Compression is healthy: the main bundle is 1505 KB decoded → **433 KB on the
wire**, a 3.5× saving. Brotli is working; the bundle is simply large.

**The warm reload is the striking number.** 224.4 KB transferred, of which
**222.5 KB is the logo PNG** — it is downloaded in full again while the JS and
CSS revalidate at ~0.3 KB each.

## Server-side, from the edge-function logs

Five real page loads. All three calls fire in parallel; the page blocks on the
slowest ([HotelTraining.tsx:317](../../src/pages/dashboard/HotelTraining.tsx#L317)).

| Load | sp-read-columns | sp-read-colleagues | sp-read-trainers | Blocked |
|---|---|---|---|---|
| A | 3057 ms | 3194 ms | 3142 ms | ~3.7 s |
| B | 2648 ms | 3711 ms | **15751 ms** | **~16 s** |
| C | 2722 ms | 2652 ms | 2474 ms | ~3.5 s |
| D | 3231 ms | 3225 ms | 3308 ms | ~3.8 s |
| E | 2590 ms | 3351 ms | 2798 ms | ~3.6 s |

Plus 3 × CORS preflight at 238–448 ms, which must complete before the POSTs start.

**Cold start is the dominant cost, not SharePoint.** On load C `sp-read-trainers`
hit its in-memory cache and never called Graph — and still took 2474 ms. The
control is `whatsapp-control-status`, a trivial function: **253–283 ms warm,
2142–2548 ms cold**. Load B's 15.7 s is the trainers cache being cold in a fresh
isolate, forcing a full User Information List walk.

## Findings this measurement produced

1. **The logo PNG is re-downloaded in full on a warm reload** — 222.5 KB, which
   is 99% of everything transferred on that reload. Confirmed twice, by
   Playwright response sizes and independently by Resource Timing. The JS and CSS
   beside it revalidate at ~0.3 KB.

   The cause is **not** an nginx problem: a conditional request carrying the
   ETag does get `304 Not Modified` with 0 bytes (verified with curl). The
   response simply carries **no `Cache-Control` and no `Last-Modified`**, only a
   weak `ETag`, so the browser has no freshness basis and re-fetches rather than
   revalidating. It is also, separately, a 223 KB PNG for a logo used on three
   screens (`Auth.tsx`, `AuthCallback.tsx`, `AppSidebar.tsx`) — two independent
   fixes, a header and an image.
2. **6 of 7 first-party responses carry no `Cache-Control` at all.** Only a weak
   `ETag`, so on a warm load 4 resources each spend a network round trip
   confirming they have not changed. Content-hashed filenames exist precisely so
   they can be `immutable` and skip that entirely.
3. **FCP is 2160 ms on the *login* page**, which is far lighter than the
   dashboard. The 433 KB main bundle is downloaded before anything renders, on
   every route including `/auth`.
4. Fonts come from `fonts.gstatic.com` — well cached (`max-age=315360000`), but
   two extra DNS + TLS handshakes on the critical path.

## A measurement correction, kept deliberately

The first version of this file reported the logo as re-downloaded on **every**
load including cold, and implied nginx was failing to revalidate. Both were
wrong, and the error came from reading cache state out of Playwright's
`request.sizes()`, which can report a full body for a response the browser served
from memory cache.

`performance.getEntriesByType('resource')` is the authority: `transferSize === 0`
means cache, under ~500 bytes means a 304, more means a real download. The script
now uses it, and the reasoning is recorded in a comment there so the next person
does not repeat it. The conditional-`curl` check is what caught the nginx half.

Relevant because the wrong version was more alarming than the truth and would
have sent someone to reconfigure nginx, which was not the problem.

## Still unmeasured

- **Browser-side timing for the three data calls.** Needs a real session; the
  command is at the top of this file. The server-side numbers above are a floor —
  they exclude the preflight, the gateway hop and render time.
- **How many colleagues are in the SharePoint list.** Determines whether
  `sp-read-colleagues` walks one Graph page (`$top=500`) or several. Not reachable
  from the dev environment: the `AZURE_*` secrets are write-only and every
  endpoint that could answer requires an admin session.

---

# After (2026-08-02, same day)

Measured against **a local `serve dist-test -l 3097 -s`** — the same command line
PM2 runs — not against the live host, because the changes below are committed but
not yet deployed. Reproduce:

```
npx vite build --outDir dist-test --emptyOutDir
serve dist-test -l 3097 -s &
node scripts/measure-page-baseline.mjs http://127.0.0.1:3097/dashboard/hotel-training --warm
```

**Read the bytes, not the clock.** On localhost there is no network latency, so
TTFB (16 ms) and FCP (196 ms) are not comparable to the live host's 261 ms and
2160 ms and are omitted below. Transferred bytes and cache state are comparable,
and they are what changed. One caveat in the honest direction: `serve` compresses
with gzip while nginx serves brotli, so the live figures should come out *below*
the "after" column.

| | Before (live, brotli) | After (local, gzip) |
|---|---|---|
| **Total over the wire, cold** | **674.9 KB** | **253.1 KB** |
| **Total over the wire, warm reload** | **224.4 KB** | **0.0 KB** |
| Resources downloaded on a warm reload | 2 | **0** |
| Resources revalidated on a warm reload (a round trip each) | 4 | **0** |
| Resources served from cache on a warm reload | 1 | **9 of 9** |
| `/assets/*` responses with no `Cache-Control` | 6 | **0** |

Cold, by bytes actually transferred:

| Wire | Decoded | Resource |
|---|---|---|
| 82.0 KB | 276.6 KB | `/assets/index-*.js` — was 433.0 KB / 1505.0 KB |
| 46.3 KB | 165.1 KB | `/assets/vendor-radix-*.js` (new) |
| 45.7 KB | 139.5 KB | `/assets/vendor-react-*.js` (new) |
| 31.1 KB | 111.4 KB | `/assets/vendor-supabase-*.js` (new) |
| 29.8 KB | 29.5 KB | `/assets/two-seasons-logo-full-*.png` — was 222.5 KB |
| 13.3 KB | 70.6 KB | `/assets/index-*.css` (unchanged) |

The three vendor chunks are new but not new *bytes* — they came out of the entry,
which fell from 433.0 KB to 82.0 KB on the wire. Their point is the deploy after
this one: they are `immutable` and their content hashes do not change when
application code does.

## What each change is worth, separately

- **The warm reload going to zero** is `public/serve.json`. Nine of nine
  subresources served from cache with no network at all, where before four spent a
  round trip revalidating and the logo was re-downloaded in full.
- **222.5 KB → 29.8 KB** is the logo, downscaled from 815×699 to 256×220 for a
  56 px box.
- **433.0 KB → 82.0 KB** on the entry is two things: pdfjs-dist and mammoth
  (~820 KB decoded) leaving it for a lazy chunk, and the vendor split.

## Still not measured, and why

- **The three data calls.** They never fire without a session, so the only way to
  see them is the authenticated variant at the top of this file. What Phase 2
  changes is which server answers: `public.sharepoint_mirror` via PostgREST, which
  is always warm, instead of three edge isolates that measured 2474–15751 ms. The
  numbers to compare are the edge-log table above against the same table taken
  after `scripts/deploy-sp-function.sh --all` — the calls should be **absent**, not
  faster.
- **The live host.** Everything above is committed and none of it is live.
  `scripts/deploy-frontend.sh` applies the frontend (and is the only thing that
  restarts `serve`, without which the cache headers stay as they were);
  `scripts/deploy-sp-function.sh --all` applies the edge side.
