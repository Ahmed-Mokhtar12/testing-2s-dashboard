# Plan: Fix the 2026-09-02 E2E audit findings

Status: EXECUTED 2026-09-02, as amended by the Codex plan debate — see
docs/superpowers/plans/2026-09-02-e2e-audit-remediation.md for the executed
task list and commit hashes. Amendments: Phase 1 (remember-me) DROPPED — the
live e2e run proves the checkbox has an accessible name today (label-wrapped in
Auth.tsx; the audit's #1 does not reproduce); Phase 8 (realtime coalescer)
DEFERRED to backlog B21; a missing-from-this-spec finding was added and fixed
(/auth and /reset-password had no <main> landmark); all six TrainingDetailsForm
controls were labelled, not just the flagged four. Audit corrections for the
record: the audit's "zero console errors" was false in Chrome (the meta
frame-ancestors warning is error-level), and the e2e kit's tests/flows/ dir is
not empty (dashboard.spec.js exists; only dashboard-a11y/data-layer specs were
fictional). Deploy: code-complete and gate-verified; the deploy itself runs via
`bash scripts/deploy-frontend.sh` (operator).
Source: external audit E2E-FINDINGS.md (2026-09-02, live testing site), mapped to
code by exploration on 2026-09-02. Suggested by Claude; decisions marked
"(decided)" were answered by the operator during planning.

## Context

An external E2E audit of the live testing app found 11 issues (1 critical,
4 high, 4 medium, 2 low) plus three data-layer inefficiencies. Functionally the
app passed everything; the gaps are accessibility structure in the dashboard
shell, security-header placement, crawler policy, and the Chat History fetch
pattern.

## Constraints that shape the fixes (from CLAUDE.md)

- `src/pages/dashboard/WhatsApp.tsx`, `src/pages/dashboard/Email.tsx`,
  `src/pages/WhatsAppLanding.tsx` are frozen — byte-identical. Any fix touching
  routes/pages they serve must happen in shared/layout/hook code.
- `npm run build` with no `--outDir` is a deploy. Use `dist-test` for inspection.
- Any change to `public/serve.json` or `vite.config.ts` requires `PW_BUILD=1
  npx playwright test`; `serve` refuses to start on an invalid serve.json
  (`@zeit/schemas`, additionalProperties: false).
- nginx for this site proxies to `serve dist -l 3007 -s` under PM2; CloudPanel
  regenerates vhosts (B11) — prefer repo-controlled fixes (serve.json) over
  hand-edited nginx.
- PostgREST clamps to `api.max_rows = 1000`; the "unbounded" Chat History query
  is in fact silently clamped to 1000 rows today.
- Deploy via `bash scripts/deploy-frontend.sh` only. One task per commit, on main.

## Findings inventory

### Accessibility
1. CRITICAL — "Remember me" checkbox no accessible name (sign-in page)
2. HIGH — sidebar not a `<nav>` landmark (all routes)
5. HIGH — `/whatsapp-inbox` + `/whatsapp`: no `<h1>`, no `<main>`
6. MED — h1→h3 heading skip on 7 routes (chart panels)
7. MED — Hotel Training: 4 unlabelled selects
11. LOW — no skip link

### Security / static config
3. HIGH — CSP only in `<meta>`; `frame-ancestors` ignored there → need HTTP header
4. HIGH — robots.txt allows all crawlers on an invitation-only app
8. MED — CSP `connect-src` includes localhost/127.0.0.1 in production
9. MED — `script-src 'unsafe-eval'`
10. LOW — /sitemap.xml answers 200 with the app shell

### Data layer
A. Chat History fetched unbounded (`select=*`, no limit; 704 ms; clamped at 1000 anyway)
B. Identical queries fire 2–3× per load (Two Seasons and Reviews, Chat History,
   sharepoint_mirror) — on a production build, so NOT StrictMode
C. /whatsapp load 5,355 ms (likely follows from A/B)

## Code map (verified by exploration)

### A11y findings → source
- **#1 Remember me**: `src/pages/Auth.tsx:290-300` — `htmlFor="remember-me"`/`id`
  pair EXISTS but the audit's axe flagged it anyway: Radix `Checkbox` renders
  `<button role="checkbox">`. Fix in Auth.tsx (editable): `aria-labelledby`
  pointing at a span around the visible text.
- **#2 Sidebar nav**: shadcn `src/components/ui/sidebar.tsx` renders `<div>` in
  all 3 branches (:180, :207, :214→:247); `AppSidebar.tsx:38` uses it. No
  nav/role anywhere. `<main>` DOES exist (`DashboardShell.tsx:82`). No skip link
  in the repo.
- **#6 Heading skip**: h1 from `SectionHeader.tsx:12`, h3 from `ChartCard.tsx:33`
  (every panel). KpiCard labels are `<p>` — NOT the culprit. Frozen WhatsApp.tsx /
  Email.tsx contain no literal h3 — they are fixed via the shared ChartCard
  without touching them. One page-local h3: `Overview.tsx:130` (Quick links).
  HotelTraining has its own h2s and is fine.
- **#5 /whatsapp + /whatsapp-inbox**: both routes → FROZEN `WhatsAppLanding.tsx`
  (12-line wrapper) → editable `src/components/whatsapp/WhatsAppChat.tsx` (:189
  mobile, :231 desktop branches, both `<div>`). h2s: `WhatsAppChatPanel.tsx:193`,
  `WhatsAppEmptyState.tsx:15`; desktop list header is a `<span>`
  (`WhatsAppSidebar.tsx:47`); mobile DOES have an h1 (`WhatsAppMobileSidebar.tsx:57`,
  list view only) → finding is desktop-specific. Fix inside WhatsAppChat.tsx.
- **#7 Hotel Training selects**: `src/components/hotel-training/TrainingDetailsForm.tsx`
  — 4 Radix Selects (Department :206/:213, Duration :231/:238, hour :312, minute
  :331) with bare `<Label>` (no htmlFor) and no id on SelectTrigger. Radix renders
  a hidden native `<select>` (aria-hidden) inside forms — that is what the
  audit's DOM query saw. Two more bare Labels (Date :276, Trainer :349) get the
  same treatment while there.
- **#11 Skip link**: add in `DashboardShell.tsx` targeting the main at :82.

### Data-layer findings → source
- **A. Unbounded Chat History**: `src/components/whatsapp/WhatsAppChat.tsx:53-94`
  `loadChatPreviews` — `select('*')`, no limit, clamped to 1000 by PostgREST on a
  ~36k-row table; builds a sender→preview Map client-side. Editable file (frozen
  WhatsAppLanding.tsx has no queries). Realtime INSERTs are merged into state in
  place (not refetched), so adding a limit does NOT break live updates — but a
  row limit is a *message* limit, not a conversation limit. Also:
  `useWhatsAppChat.ts:277-283` poll (8s interval) is unbounded but filtered by
  `created_at > last seen`; thread fetches already use `.limit(1000)`.
- **Pattern to reuse**: `fetchAllRows` (`src/hooks/insights/utils.ts:61-79`) +
  id-tiebreaker ordering (commit 1867933); `useWhatsAppInsights.ts:24-32` shows
  named-column, date-bounded, paged reads.
- **B. Duplicates** (app uses TanStack Query, one client, staleTime 5min,
  `App.tsx:30-38`; NO StrictMode in main.tsx):
  1. `RealtimeBridge.tsx:5-45` — subscribes `event:'*'` on 8 tables (mapping to
     6 query keys), calls `invalidateQueries` on ANY event; mounted on every
     dashboard route (`DashboardShell.tsx:35`). Chat History inserts arrive
     continuously → identical refetches bypassing staleTime. Strongest cause.
  2. `retry: 1` (global + `useColleagues.ts:31`) — a transient first-attempt
     failure re-issues an identical request. Not a bug.
  3. `sharepoint_mirror` "duplicates" are partly two DIFFERENT keyed queries
     (`key=eq.colleagues` vs `key=eq.columns`) grouped by table in the audit.
  4. On `/whatsapp` (no RealtimeBridge): `scheduleRefetch()` refires the preview
     query on channel error/timeout and archive flips (`WhatsAppChat.tsx:157-176`).
- **C. 5.4s /whatsapp load**: follows from A/B; re-measure after the fixes.

### Security findings → source
- **#3 CSP meta-only**: full CSP in `index.html:6-19` (unconditional, no dev/prod
  split). The nginx CSP `add_header` in `/etc/nginx/global_settings:5` is
  COMMENTED OUT. All passing headers (HSTS, XFO SAMEORIGIN, nosniff, Referrer,
  XPCDP) come from `global_settings:1-7`, inherited into the vhost's bare
  `location /` proxy block. Traps: (a) `global_settings` is server-wide — 5
  CloudPanel sites share it, wrong place for a site CSP; (b) adding ANY
  `add_header` inside `location /` silently drops all 8 inherited headers;
  (c) B11 — CloudPanel regenerates the vhost at cert renewal, reverting hand
  edits. nginx does NOT strip upstream headers → headers emitted by `serve` via
  serve.json pass through (proven live by cache-control).
  → Channel for testing: `public/serve.json` "headers" — schema-verified OK
  (value ≤2048 chars, single line, printable ASCII). B12: serve.json is INERT on
  production — production CSP needs CloudPanel template (operator handoff).
- **#8 localhost in connect-src**: `index.html:12` — unconditional, remove.
- **#9 unsafe-eval**: only real consumer is bluebird (via mammoth) in the lazy
  `clientSideDocumentProcessor` chunk (paperclip doc upload) — a feature the
  2026-09-01 audit (W5) found silently dead (no INSERT policy). pdf.js's
  `new Function("")` probe is CSP-safe. README.md:53 blames Recharts — provably
  wrong (no eval in recharts). Bonus: `worker-src https://cdnjs.cloudflare.com`
  is dead weight (W9 — pdf.js 5.x worker 404s there).
- **#4 robots.txt**: `public/robots.txt` — Lovable scaffold default (Allow: / for
  5 UAs), never a decision.
- **#10 sitemap.xml**: caused by the `-s` flag on `serve dist -l 3007 -s` (SPA
  rewrite); serve.json has no rewrites; nginx has no try_files.
- Prior tracking: 2026-09-01 security audit report W10/I7/W9 + remediation item
  20 cover the CSP findings; docs/backlog.md has NO CSP/robots item.
- `scripts/deploy-frontend.sh:211-222` asserts served headers post-deploy — any
  new header needs a matching assertion there to be enforced.

### Test-suite reality
- This repo's Playwright suite: mock-auth only (`tests/helpers/hotel-training-mocks.ts`),
  chromium + mobile-chrome, no a11y or data-layer specs.
- The audit's suite is a separate checkout at `/root/projects/e2e-kit` (targets
  the live URL, real sign-in via TEST_USER_EMAIL/PASSWORD, 4 browser projects).
  Its `tests/flows/` dir EXISTS BUT IS EMPTY — the 37 new specs named in the
  report (dashboard-a11y.spec.js, data-layer.spec.js) are not on disk. Smoke
  specs (accessibility, auth-guard, auth-page, performance) are present.

## Decisions (decided during planning)

- **'unsafe-eval': REMOVE from the CSP.** Only consumer is bluebird-via-mammoth
  in the dead document-upload path. The feature CODE IS KEPT (removal of the
  directive was approved, not deletion of the feature) — .docx parsing throws if
  the path is ever revived, until the directive is re-added; full feature
  removal (or revival) becomes a backlog item.
- **sitemap.xml: ship an empty `<urlset>`** at public/sitemap.xml
  (repo-controlled, 200 with real XML, zero URLs) rather than an operator
  nginx 404.

## Load-bearing design facts (verified in code)

- serve-handler matches header `source` globs against the **resolved file's**
  path after the `-s` rewrite, so a CSP added to serve.json's existing
  `/index.html` headers entry covers `/` and every deep link (proven by the
  existing no-cache assertion on `/`). Real files beat the rewrite → a static
  sitemap.xml serves as XML.
- `scripts/rehearse-deploy-frontend.sh` fakes curl with only Content-Type +
  Cache-Control, and `tests/unit/deploy-frontend-overlay.test.ts` runs the real
  deploy script through it inside `npm run test:unit` — a new CSP assertion in
  deploy-frontend.sh MUST land with a shim update in the same commit.
- `index.css:124` styles h1–h6 identically (font only) → ChartCard h3→h2 is
  pixel-inert; but promoting WhatsAppSidebar's `<span>Chats` to h1 would CHANGE
  its font → use an sr-only h1 instead.
- Mobile /whatsapp h1 exists only in list view; the mobile chat view has none →
  the sr-only h1 must be conditional per branch (never two h1s in list view).
- Existing PW specs: whatsapp shell selected by testid only; headings via
  `main h1, main h2, main h3` (tolerant) and the guest-name h2 (untouched);
  hotel-training comboboxes filtered by hasText; `getByLabel('Remember me')`
  survives aria-labelledby (same name). full-viewport/kpi specs never visit
  /whatsapp.
- WhatsApp preview builder reads exactly: `id, created_at, Name, human_reply,
  Media, "Sender Number", "Ai Reply", "Sender Message"`.
- `invalidateQueries` already defaults to refetchType 'active' — the damping
  lever is a trailing coalescer, with in-repo precedent (`scheduleRefetch`,
  WhatsAppChat.tsx:102-108). 8 tables map to 6 query keys → coalesce per KEY.
- No inline scripts in index.html (current CSP already lacks 'unsafe-inline' in
  script-src and the live site works) → dropping 'unsafe-eval' only affects the
  lazy mammoth/bluebird chunk behind the dead paperclip upload.

## Implementation (one commit per phase, on main)

**Phase 0 — baseline (no commit).** `npm run typecheck && npm run lint && npm run
test:unit` green before any edit. Frozen-file guard after every phase:
`git diff --stat src/pages/dashboard/WhatsApp.tsx src/pages/dashboard/Email.tsx
src/pages/WhatsAppLanding.tsx` must be empty.

**Phase 1 — Remember-me name (audit #1).** `src/pages/Auth.tsx:290-300`: wrap the
text in `<span id="remember-me-label">Remember me</span>`, add
`aria-labelledby="remember-me-label"` to the Checkbox; keep htmlFor/id.
Verify: gates + `npx playwright test tests/manual-checklist.spec.ts`.

**Phase 2 — nav landmark (audit #2).** `src/components/dashboard/AppSidebar.tsx`:
wrap the `<SidebarGroup>` (lines 52-79) in `<nav aria-label="Main">` — lands the
landmark in mobile Sheet AND desktop branches with zero edits to the shadcn
primitive. Verify: gates + full-viewport spec (both projects).

**Phase 3 — skip link (audit #11).** `src/layouts/DashboardShell.tsx`: plain
anchor `href="#main-content"` as first child of the outer div (sr-only until
focus, Tailwind `focus:not-sr-only focus:fixed …`); main at :82 gains
`id="main-content" tabIndex={-1}`.

**Phase 4 — heading hierarchy (audit #6).** `ChartCard.tsx:33` h3→h2 (classes
unchanged; fixes all pages incl. the frozen ones through the shared component) +
`Overview.tsx:130` h3→h2. `ui/card.tsx` CardTitle (2 unflagged usages) left
alone, noted as residual in the commit body.

**Phase 5 — /whatsapp landmark + h1 (audit #5).** `WhatsAppChat.tsx` only:
- :189 and :231 shell `div`→`main`, testid + classes byte-identical.
- Desktop branch: first child `<h1 className="sr-only">WhatsApp conversations</h1>`.
- Mobile branch: sr-only h1 ONLY inside the `mobileView === 'chat'` wrapper
  (list view keeps its visible h1 in WhatsAppMobileSidebar).
Covers both routes (same component). Verify: gates + whatsapp spec, frozen diff.

**Phase 6 — Hotel Training names (audit #7).**
`src/components/hotel-training/TrainingDetailsForm.tsx`:
- Department (:206/:213) and Duration (:231/:239): `Label id="…-label"` +
  `SelectTrigger id aria-labelledby`.
- Hour (:313) `aria-label="Hour"`, minute (:332) `aria-label="Minute"` under the
  shared visible "Time" label.
- Date (:276/:285): `Label id="date-label"`, trigger
  `aria-labelledby="date-label date-trigger"` (name + current value).
- Trainer (:349): add optional `ariaLabelledby` prop to `TrainerPicker` (trigger
  Button at TrainerPicker.tsx:88-90), pass `"trainers-label"`.
Verify: gates + hotel-training spec (hasText selection unaffected).

**Phase 7 — preview query + poll limit (audit A).** `WhatsAppChat.tsx:58-62`:

```
.select('id, created_at, Name, human_reply, Media, "Sender Number", "Ai Reply", "Sender Message"')
.eq('is_archived', false)
.order('created_at', { ascending: false })
.order('id', { ascending: false })
.limit(1000)
```

(Behaviorally the clamp already returned these 1000 rows — this makes the cap
explicit + deterministic and shrinks the payload; realtime INSERT patching keeps
liveness.) Plus defensive `.limit(1000)` on the 8s poll
(`useWhatsAppChat.ts:277-283`). `no-overclamp-limit` allows .limit(1000); spec
mocks match on path, not select string.

**Phase 8 — RealtimeBridge damping (audit B).** Extract a pure
`makeTrailingCoalescer(delayMs, fn)` into `src/lib/coalesce.ts`; RealtimeBridge
coalesces `invalidateQueries` per query KEY (`queryKey.join('|')`), 3s trailing;
cleanup clears timers. New `tests/unit/realtime-coalesce.test.ts` (node:test
mock timers: burst→one call; refire after; cancel clears). `retry:1` and the two
distinct sharepoint_mirror queries are NOT bugs — untouched.

**Phase 9 — robots.txt (audit #4).** Replace scaffold with
`User-agent: *` / `Disallow: /`.

**Phase 10 — sitemap.xml (audit #10, decided).** Add `public/sitemap.xml` with an
empty `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` — real file
beats the -s rewrite on testing, served directly by nginx on production.

**Phase 11 — CSP header + meta mirror + drift pin (audit #3/#8/#9, decided:
'unsafe-eval' removed).** One commit, requires PW_BUILD:
1. `public/serve.json`: append to the EXISTING `/index.html` entry's headers:
   `Content-Security-Policy` = single-line: `default-src 'self'; script-src
   'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
   font-src 'self' https://fonts.gstatic.com data:; connect-src 'self'
   https://*.supabase.co wss://*.supabase.co https://login.microsoftonline.com;
   img-src 'self' data: blob: https://*.supabase.co
   https://2s-dashboard.digitlab.ai; media-src 'self' blob:
   https://*.supabase.co; worker-src 'self' blob:; object-src 'none'; base-uri
   'self'; form-action 'self'; frame-ancestors 'none'`
   (no unsafe-eval, no localhost, no dead cdnjs worker-src).
2. `index.html:6-19`: meta mirrors the header MINUS `frame-ancestors` (spec-
   ignored in meta; keeping an inert-but-protective-looking directive is the
   false-green this repo's docs warn about). Meta stays because production nginx
   serves dist/ directly (B12) — it is production's only CSP until the operator
   handoff.
3. New `tests/unit/csp-header-meta-agree.test.ts` (style of
   colleague-fields-agree): parse both into Map<directive, Set<source>>, assert
   equal with exactly frame-ancestors allowed header-only; anti-vacuity
   (default-src 'self' in both, frame-ancestors 'none' in header); pin no
   localhost/127.0.0.1/cdnjs/unsafe-eval; header value single-line ≤2048.
4. `tests/unit/serve-config-valid.test.ts`: assert the /index.html entry carries
   a Content-Security-Policy header.
5. `scripts/deploy-frontend.sh` (after :215): fail unless the served `/` headers
   include `content-security-policy:.*frame-ancestors`. PAIRED in the same
   commit: `scripts/rehearse-deploy-frontend.sh` fake build copies the real
   public/serve.json and its fake curl emits the CSP from it — otherwise
   `deploy-frontend-overlay.test.ts` breaks `npm run test:unit`.
6. `README.md:46-70`: CSP is a header from serve.json on testing, meta as
   production mirror; correct the 'unsafe-eval' attribution (bluebird via
   mammoth, NOT Recharts) and note the directive is now removed — the dead
   paperclip-upload path throws on .docx parsing if revived until it's re-added.
Verify: gates; `PW_BUILD=1 npx playwright test --workers=1` (REQUIRED —
serve.json changed; workers=1 per host-load lesson); then serve dist-test on a
spare port and curl `/`, a deep link, an asset, robots.txt, sitemap.xml for the
new headers; `bash scripts/rehearse-deploy-frontend.sh` by hand.

**Phase 12 — deploy + live verification.** Full battery (typecheck, lint,
test:unit, playwright, PW_BUILD=1 --workers=1), then
`bash scripts/deploy-frontend.sh`. Post-deploy curls of the live URL: `/` (CSP +
no-cache), deep link (CSP), robots.txt, sitemap.xml, hashed asset (immutable).
Re-measure /whatsapp load (audit C — re-measured, not claimed fixed).

**Phase 13 — docs + operator handoff (final commit).** `docs/backlog.md`:
(a) new item: server-side conversation-list RPC/view (DISTINCT ON sender,
newest-first) — the real fix for the "1000 newest messages ≠ 1000 conversations"
preview window; (b) new item: delete the dead client-side document upload
(mammoth/pdfjs/bluebird — the former 'unsafe-eval' consumer) or revive it with
an INSERT policy + bundled pdf.worker (`?url` import; the cdnjs URL 404s on
pdf.js 5.x, audit W9); (c) append to B12: the production CSP header belongs in
CloudPanel's stored vhost template (B11 reverts hand-edits at cert renewal) —
exact header value handed over from serve.json. Record the /whatsapp
re-measurement.

## Verification (end-to-end)

1. Per-phase: typecheck + lint + test:unit + targeted PW spec + frozen-file diff.
2. Phase 11 onward: `PW_BUILD=1 npx playwright test --workers=1` + local
   dist-test curls before any deploy.
3. Deploy via `scripts/deploy-frontend.sh` only; its own header assertions (now
   incl. CSP) gate success; live curls afterward.
4. Acceptance: re-run the external suite at `/root/projects/e2e-kit` against the
   live testing URL (needs TEST_USER_EMAIL/PASSWORD in its .env; its
   tests/flows/ specs from the report are not on disk — smoke specs still run).
   Expected deltas: axe button-name/landmark/heading/select-name clean; CSP
   header present with frame-ancestors, no localhost/cdnjs/unsafe-eval; robots
   Disallow; sitemap 200 XML; /whatsapp payload down, duplicate volume damped.

## Out of scope / explicitly not done

- nginx: no edits to the CloudPanel vhost (B11) or the server-wide
  /etc/nginx/global_settings (5 sites share it). Production CSP = operator
  handoff via CloudPanel template (B12).
- Frozen files, n8n, emails: untouched.
- CardTitle h3 (2 unflagged usages), sharepoint_mirror "duplicates" (two
  legitimately distinct queries), retry:1: left as is, documented.
