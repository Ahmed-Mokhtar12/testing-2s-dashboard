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
