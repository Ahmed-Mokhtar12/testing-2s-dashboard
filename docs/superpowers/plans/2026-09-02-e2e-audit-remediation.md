# E2E Audit Remediation (Minimal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every confirmed finding from the 2026-09-02 E2E audit with the smallest safe change set, on a live site that is otherwise healthy.

**Architecture:** Accessibility landmarks/names land in shared or page-local components (never the frozen files); the CSP becomes an HTTP header via `public/serve.json` with the `<meta>` kept as a production mirror, pinned by a new drift test; static policy files (`robots.txt`, `sitemap.xml`) are repo-controlled so no nginx is touched. One deploy at the end.

**Tech Stack:** Vite + React + TypeScript, Radix/shadcn, Supabase JS, `serve` under PM2, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-02-e2e-audit-remediation-plan.md` — as amended by the 2026-09-02 Codex debate (read-only, high effort):
1. Draft Phase 1 (Remember-me `aria-labelledby`) **dropped** — the live e2e run proves the name computes today (axe `button-name` and `toHaveAccessibleName` both pass); minimal remediation does not patch non-defects.
2. Draft Phase 8 (RealtimeBridge coalescer) **deferred to backlog** — riskiest behavioral change, perf/egress-only finding.
3. **Added**: `<main>` landmark on `/auth` + `/reset-password` (confirmed red by the independent e2e kit at `/root/projects/e2e-kit`, missed by the audit and the draft).
4. Hotel-training labels cover **all six** controls (4 flagged + Date + Trainer).

## Global Constraints

- `src/pages/dashboard/WhatsApp.tsx`, `src/pages/dashboard/Email.tsx`, `src/pages/WhatsAppLanding.tsx` stay **byte-identical**. After every task: `git diff --stat src/pages/dashboard/WhatsApp.tsx src/pages/dashboard/Email.tsx src/pages/WhatsAppLanding.tsx` must print nothing.
- **Never run bare `npm run build`** — it writes `dist/`, which is live. Inspection builds: `npx vite build --outDir dist-test`.
- Gates per task: `npm run typecheck && npm run lint && npm run test:unit` plus the named Playwright spec. Any change to `public/serve.json` additionally requires `PW_BUILD=1 npx playwright test --workers=1`.
- Deploy only via `bash scripts/deploy-frontend.sh`. One task per commit, on `main`. Every commit ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- No nginx/CloudPanel edits (B11), no n8n edits, no emails.

---

### Task 1: Sidebar `<nav>` landmark (audit #2) — ✅ DONE, commit `c03fa2f`

**Files:** Modify: `src/components/dashboard/AppSidebar.tsx`

- [x] Wrap the `<SidebarGroup>…</SidebarGroup>` block (was lines 52–79) in `<nav aria-label="Main">…</nav>`, indenting the block one level. No other change.
- [x] Run: `npm run typecheck && npm run lint && npx playwright test tests/full-viewport.spec.ts` → PASS (27 passed, both projects)
- [x] Commit.

### Task 2: Skip link (audit #11) — ✅ DONE, commit `9a701de`

**Files:** Modify: `src/layouts/DashboardShell.tsx`

- [x] First child of the outer flex `div` (before `<AppSidebar />`):

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
>
  Skip to main content
</a>
```

- [x] The shared `<main>` (line 82) gains `id="main-content" tabIndex={-1}` (className untouched). `sr-only` is `position:absolute`, so the anchor never participates in the flex row.
- [x] Run: `npm run typecheck && npm run lint` → PASS. Commit.

### Task 3: `<main>` on the public pages (new e2e-kit finding) — ✅ DONE, commit `9a2f7e9`

**Files:** Modify: `src/pages/Auth.tsx`, `src/pages/ResetPassword.tsx`

- [x] `Auth.tsx` (~line 230) and all three return branches of `ResetPassword.tsx` (~171/179/211): the outer `<div className="min-h-screen flex items-center justify-center bg-background…">` wrapper becomes `<main>` with **identical classes** (and its matching `</div>` becomes `</main>`). One branch renders at a time → never two mains; block-level rendering unchanged.
- [x] Run: `npm run typecheck && npm run lint && npx playwright test tests/auth-callback.spec.ts` → PASS (4 passed). Commit.

### Task 4: Heading hierarchy (audit #6) — ✅ DONE, commit `f63089b`

**Files:** Modify: `src/components/dashboard/ChartCard.tsx:33`, `src/pages/dashboard/Overview.tsx:130`

- [x] `ChartCard.tsx`: `<h3 className="font-display font-semibold text-base">{title}</h3>` → same element as `<h2>`. Fixes all seven flagged routes (incl. the frozen pages) through the shared component.
- [x] `Overview.tsx`: `<h3 className="font-display font-semibold mb-3 short:mb-2">Quick links</h3>` → `<h2>`.
- [x] Pixel-inert (verified): `src/index.css` styles `h1–h6` identically (font-family/letter-spacing only) and both elements carry explicit size/weight classes. CardTitle's two unflagged h3 usages left alone.
- [x] Run: `npm run typecheck && npm run lint` + frozen-file diff empty → PASS. Commit.

### Task 5: `/whatsapp` + `/whatsapp-inbox` landmarks + h1 (audit #5) — ✅ DONE, commit `4bc8e0c`

**Files:** Modify: `src/components/whatsapp/WhatsAppChat.tsx` (frozen `WhatsAppLanding.tsx` untouched; both routes mount outside `DashboardShell`, verified in `App.tsx`, so no nested `<main>`)

- [x] Both shell `div`s (`data-testid="whatsapp-chat-shell"`, mobile ~:189 and desktop ~:231) become `<main>` with testid/classes byte-identical.
- [x] Desktop branch: `<h1 className="sr-only">WhatsApp conversations</h1>` as first child (before `<WhatsAppNavRail />`).
- [x] Mobile branch: the same sr-only h1 **only** inside the `mobileView === 'chat'` wrapper — list view keeps its visible h1 in `WhatsAppMobileSidebar`, so never two h1s.
- [x] Run: `npm run typecheck && npm run lint && npx playwright test tests/whatsapp.spec.ts` → PASS (15 passed) + frozen diff empty. Commit.

### Task 6: Hotel Training control names (audit #7) — ✅ DONE, commit `4e0bf47`

**Files:** Modify: `src/components/hotel-training/TrainingDetailsForm.tsx`, `src/components/hotel-training/TrainerPicker.tsx`

- [x] Department: `<Label id="department-label">`; its `<SelectTrigger id="department-trigger" aria-labelledby="department-label department-trigger">` (label + own id so the selected value stays in the accessible name).
- [x] Duration: same pattern with `duration-label` / `duration-trigger`.
- [x] Hour/minute selects (shared visible "Time" label): `aria-label="Hour"` / `aria-label="Minute"` on their `SelectTrigger`s.
- [x] Date: `<Label id="date-label">`; the Popover trigger `Button` gains `id="date-trigger" aria-labelledby="date-label date-trigger"`.
- [x] Trainer: `<Label id="trainers-label">`; `TrainerPicker` gains an optional `ariaLabelledby?: string` prop; its trigger `Button` gains `id="trainer-select"` and `aria-labelledby={ariaLabelledby ? `${ariaLabelledby} trainer-select` : undefined}`; the form passes `ariaLabelledby="trainers-label"`.
- [x] Run: `npm run typecheck && npm run lint && npx playwright test tests/hotel-training.spec.ts` → PASS (39 passed, 9.9m under host load; spec selects comboboxes by hasText, unaffected).
- [x] Commit: `a11y(hotel-training): name all six unlabelled pickers (audit #7)`

### Task 7: WhatsApp preview query + poll limit (audit A)

**Files:** Modify: `src/components/whatsapp/WhatsAppChat.tsx` (in `loadChatPreviews`), `src/hooks/useWhatsAppChat.ts` (polling effect)

**Interfaces:** the preview builder reads exactly `id, created_at, Name, human_reply, Media, "Sender Number", "Ai Reply", "Sender Message"` — no other column may be dropped from the select.

- [ ] **Step 1:** In `WhatsAppChat.tsx` `loadChatPreviews`, replace the query:

```ts
const { data, error } = await supabase
  .from('Chat History')
  .select('id, created_at, Name, human_reply, Media, "Sender Number", "Ai Reply", "Sender Message"')
  .eq('is_archived', false)
  .order('created_at', { ascending: false })
  .order('id', { ascending: false })
  .limit(1000);
```

(Was `select('*')` with no limit — PostgREST already clamps at `api.max_rows = 1000`, so this makes today's window explicit and deterministic (id tiebreak per commit `1867933`) and shrinks the payload. Realtime INSERTs are merged into state in place, so liveness is unaffected.)

- [ ] **Step 2:** In `useWhatsAppChat.ts`, the 8s polling fallback (~line 277) gains a defensive cap — append `.limit(1000)` after `.order('created_at', { ascending: true })`.
- [ ] **Step 3:** Run: `npm run typecheck && npm run lint && npm run test:unit` (the `no-overclamp-limit` test permits `.limit(1000)`; it forbids only limits **above** the clamp). Expected: PASS.
- [ ] **Step 4:** Run: `npx playwright test tests/whatsapp.spec.ts` (mocks match on path, not the select string). Expected: PASS.
- [ ] **Step 5:** Commit: `perf(whatsapp): named columns + explicit 1000-row cap on preview query and poll (audit A)`

### Task 8: robots.txt (audit #4)

**Files:** Modify: `public/robots.txt`

- [ ] **Step 1:** Replace the entire file (Lovable scaffold, five `Allow: /` UA blocks) with:

```
User-agent: *
Disallow: /
```

- [ ] **Step 2:** Run: `npm run test:unit` (nothing pins robots; this is a sanity gate). Expected: PASS.
- [ ] **Step 3:** Commit: `security(robots): disallow all crawlers on the invitation-only app (audit #4)`

### Task 9: sitemap.xml (audit #10, operator-decided)

**Files:** Create: `public/sitemap.xml`

- [ ] **Step 1:** Create with exactly:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>
```

A real file beats `serve`'s `--single` rewrite on testing, and production nginx serves `dist/` files directly — so the path stops answering with the app shell on both machines.

- [ ] **Step 2:** Commit: `security(sitemap): empty urlset instead of the app shell (audit #10)`

### Task 10: CSP as HTTP header + meta mirror + drift pin (audit #3/#8/#9; 'unsafe-eval' removal operator-decided)

**Files:**
- Create: `tests/unit/csp-header-meta-agree.test.ts`
- Modify: `public/serve.json`, `index.html`, `tests/unit/serve-config-valid.test.ts`, `scripts/deploy-frontend.sh`, `scripts/rehearse-deploy-frontend.sh`, `README.md`

**The one policy** (single line, ~590 chars, ≤2048 per @zeit/schemas):

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://login.microsoftonline.com; img-src 'self' data: blob: https://*.supabase.co https://2s-dashboard.digitlab.ai; media-src 'self' blob: https://*.supabase.co; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Deltas vs today: `'unsafe-eval'` removed (sole consumer is bluebird-via-mammoth in the dead paperclip-upload path — NOT Recharts); `http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*` removed from connect-src (dev HMR is same-origin, covered by `'self'` under CSP3 — the default Playwright suite against `npm run dev` verifies this); dead `https://cdnjs.cloudflare.com` dropped from worker-src (pdf.js 5.x 404s there anyway, audit W9); `form-action 'self'` added. The **meta mirrors the header MINUS `frame-ancestors 'none'`** — browsers ignore frame-ancestors in `<meta>` (it Chrome-logs a console.error today), and an inert-but-protective-looking directive is the false green `docs/testing-lessons.md` warns about. The meta stays because production nginx serves `dist/` directly (B12) — it is production's only CSP until the operator handoff.

- [ ] **Step 1 (failing tests first):** Create `tests/unit/csp-header-meta-agree.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The CSP is delivered twice: as an HTTP header from public/serve.json (testing,
// where nginx proxies to `serve`) and as a <meta http-equiv> in index.html
// (production, where nginx serves dist/ directly and serve.json is inert — B12).
// Two copies drift unless pinned to each other. One deliberate exception:
// frame-ancestors is header-ONLY — browsers ignore it in <meta>, and an
// inert-but-protective-looking directive is exactly the false green
// docs/testing-lessons.md warns about.

function parseCsp(policy: string): Map<string, Set<string>> {
  const directives = new Map<string, Set<string>>();
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...sources] = tokens;
    assert.ok(!directives.has(name), `duplicate directive ${name}`);
    directives.set(name, new Set(sources));
  }
  return directives;
}

function headerValue(): string {
  const config = JSON.parse(readFileSync('public/serve.json', 'utf8')) as {
    headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
  };
  const entry = (config.headers ?? []).find((candidate) => candidate.source === '/index.html');
  assert.ok(entry, 'serve.json has no /index.html headers entry');
  const header = (entry.headers ?? []).find((h) => h.key === 'Content-Security-Policy');
  assert.ok(header, 'serve.json /index.html carries no Content-Security-Policy');
  return header.value ?? '';
}

function metaValue(): string {
  const html = readFileSync('index.html', 'utf8');
  const match = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
  assert.ok(match, 'index.html has no Content-Security-Policy <meta>');
  return match[1];
}

test('the header CSP is a single line serve can emit', () => {
  const value = headerValue();
  assert.ok(!/[\r\n]/.test(value), 'serve.json header values must be single-line');
  assert.ok(value.length <= 2048, `header value is ${value.length} chars; @zeit/schemas caps at 2048`);
  assert.match(value, /^[\x20-\x7e]+$/, 'header value must be printable ASCII');
});

test('header and meta carry the same policy, except frame-ancestors is header-only', () => {
  const header = parseCsp(headerValue());
  const meta = parseCsp(metaValue());

  assert.ok(header.has('frame-ancestors'), 'header must carry frame-ancestors');
  assert.deepEqual([...(header.get('frame-ancestors') ?? [])], ["'none'"]);
  assert.ok(!meta.has('frame-ancestors'), 'frame-ancestors is spec-ignored in <meta>; carrying it there is a false green');

  header.delete('frame-ancestors');
  assert.deepEqual([...header.keys()].sort(), [...meta.keys()].sort(), 'directive sets differ');
  for (const [name, sources] of header) {
    assert.deepEqual([...sources].sort(), [...(meta.get(name) ?? [])].sort(), `sources differ for ${name}`);
  }
  // Anti-vacuity: this test must fail if either copy goes empty.
  assert.deepEqual([...(meta.get('default-src') ?? [])], ["'self'"]);
});

test('neither copy readmits the audited-out sources', () => {
  for (const policy of [headerValue(), metaValue()]) {
    assert.ok(!/localhost|127\.0\.0\.1/.test(policy), 'dev origins do not belong in the shipped CSP (audit #8)');
    assert.ok(!policy.includes("'unsafe-eval'"), "'unsafe-eval' was removed by decision (audit #9)");
    assert.ok(!policy.includes('cdnjs.cloudflare.com'), 'the cdnjs worker-src is dead weight (W9)');
  }
});
```

- [ ] **Step 2:** Run `npm run test:unit` → the new file must FAIL with "serve.json /index.html carries no Content-Security-Policy".
- [ ] **Step 3:** `public/serve.json` — append to the **existing** `/index.html` entry's `headers` array (serve-handler matches the resolved file after the `--single` rewrite, so this covers `/` and every deep link — proven by the existing no-cache assertion):

```json
{
  "key": "Content-Security-Policy",
  "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://login.microsoftonline.com; img-src 'self' data: blob: https://*.supabase.co https://2s-dashboard.digitlab.ai; media-src 'self' blob: https://*.supabase.co; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
}
```

- [ ] **Step 4:** `index.html` — replace the `<meta http-equiv="Content-Security-Policy">` content with the same policy minus `frame-ancestors 'none'` (keep the current multiline formatting; the test collapses whitespace):

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self';
           script-src 'self';
           style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
           font-src 'self' https://fonts.gstatic.com data:;
           connect-src 'self' https://*.supabase.co wss://*.supabase.co https://login.microsoftonline.com;
           img-src 'self' data: blob: https://*.supabase.co https://2s-dashboard.digitlab.ai;
           media-src 'self' blob: https://*.supabase.co;
           worker-src 'self' blob:;
           object-src 'none';
           base-uri 'self';
           form-action 'self';"
/>
```

- [ ] **Step 5:** `tests/unit/serve-config-valid.test.ts` — add a third test:

```ts
test('index.html carries the Content-Security-Policy header', () => {
  const config = loadConfig();
  const entry = (config.headers ?? []).find((candidate) => candidate.source === '/index.html');
  assert.ok(entry, 'no headers entry for /index.html');
  const csp = entry.headers?.find((header) => header.key === 'Content-Security-Policy');
  assert.ok(csp, '/index.html has no Content-Security-Policy header');
  assert.match(csp.value ?? '', /frame-ancestors 'none'/);
});
```

- [ ] **Step 6:** `scripts/deploy-frontend.sh` — directly after the existing `INDEX_HEADERS` no-cache assertion (~line 215):

```bash
grep -qi 'content-security-policy:.*frame-ancestors' <<<"$INDEX_HEADERS" \
  || fail "/ is missing the Content-Security-Policy header; browsers ignore frame-ancestors in <meta>, so without this header the app ships no effective clickjacking CSP"
```

- [ ] **Step 7 (same commit, or `deploy-frontend-overlay.test.ts` breaks test:unit):** `scripts/rehearse-deploy-frontend.sh` — bake the real CSP into the fake curl. Before `cat > "$BIN/curl"`, add:

```bash
CSP_HEADER=$(node -e 'const c=require(process.argv[1]);const e=(c.headers||[]).find(x=>x.source==="/index.html");const h=((e||{}).headers||[]).find(x=>x.key==="Content-Security-Policy");process.stdout.write(h?h.value:"")' "$REAL_REPO/public/serve.json")
```

and change the fake curl's HEAD branch to emit it for HTML responses:

```bash
if [ "\$HEAD" = 1 ]; then
  if [ "\$CT" = "text/html" ] && [ -n "$CSP_HEADER" ]; then
    printf 'HTTP/1.1 200 OK\r\nContent-Type: %s\r\nCache-Control: %s\r\nContent-Security-Policy: %s\r\n\r\n' "\$CT" "\$CC" "$CSP_HEADER"
  else
    printf 'HTTP/1.1 200 OK\r\nContent-Type: %s\r\nCache-Control: %s\r\n\r\n' "\$CT" "\$CC"
  fi
fi
```

(Sourcing from the real `serve.json` keeps the rehearsal faithful: if the CSP ever leaves serve.json, the rehearsal fails exactly like the real deploy would.)

- [ ] **Step 8:** `README.md` "Security Notes" (~lines 46–70): update the `script-src` bullet to `'self'` with the corrected attribution — the former `'unsafe-eval'` consumer was **bluebird via mammoth** in the dead client-side document-upload path, not Recharts; the directive is now removed, and reviving that path requires re-adding it or `.docx` parsing throws. Update the `connect-src` bullet (no localhost — dev is same-origin under `'self'`), the `worker-src` bullet (no cdnjs), and add a delivery paragraph: on testing the CSP is an HTTP header from `public/serve.json`; the meta is the production mirror minus `frame-ancestors` (header-only by design), pinned by `tests/unit/csp-header-meta-agree.test.ts`.
- [ ] **Step 9:** Run `npm run typecheck && npm run lint && npm run test:unit` → PASS (csp-header-meta-agree, serve-config-valid, deploy-frontend-overlay all green).
- [ ] **Step 10:** Run `bash scripts/rehearse-deploy-frontend.sh` by hand → PASS.
- [ ] **Step 11:** Run `PW_BUILD=1 npx playwright test --workers=1` (REQUIRED — serve.json changed; workers=1 per the host-load lesson). Expected: same pass/skip counts as the pre-change baseline.
- [ ] **Step 12:** Serve `dist-test` on a spare port with the PM2 command line (`npx serve dist-test -l 3999 -s`) and curl `-sI` `/`, `/dashboard/reviews`, one `/assets/*.js`, `/robots.txt`, `/sitemap.xml` — verify the CSP header on the HTML responses, `no-cache` on `/`, XML (not HTML) for the sitemap. Kill the spare server.
- [ ] **Step 13:** Commit: `security(csp): deliver the CSP as an HTTP header, meta as production mirror; drop unsafe-eval, dev origins, dead cdnjs worker-src (audit #3/#8/#9)`

### Task 11: Deploy + live verification — ✅ DONE (deploy run by the operator)

- [x] **Step 1:** Full battery: typecheck, lint, test:unit 289 pass, full default suite **134 passed / 0 failed** (12.6m), `PW_BUILD=1 --workers=1` green (after updating manual-checklist's stale meta-CSP expectation to the new contract).
- [x] **Step 2:** `bash scripts/deploy-frontend.sh` — run by the operator 2026-09-02 15:52 (+04) (Claude's invocation was permission-blocked; the pre-deploy tree is `dist.bak-20260902-155210`). The CSP assertion gated it: fail() exits before DEPLOY OK. Follow-up `393c756` makes the DEPLOY OK line *name* the CSP check.
- [x] **Step 3:** Live curls verified: `/` and a deep link serve the full CSP header with `frame-ancestors 'none'`; `cache-control: no-cache` on `/`; robots.txt Disallow; sitemap.xml real XML.
- [x] **Step 4:** Acceptance — the independent kit: **36 passed / 0 failed / 13 skipped** (was 29/7/13). Visual baselines matched with NO update — div→main confirmed pixel-inert. `/whatsapp` load re-measurement still owed a QA credential (signed-in flows skip; recorded in B21).

### Task 12: Docs + backlog — ✅ DONE, commit `5cb657f`

**Files:** Modify: `docs/backlog.md`, `docs/superpowers/specs/2026-09-02-e2e-audit-remediation-plan.md` (status header only)

- [x] **Step 1:** `docs/backlog.md` — highest existing item is B20, so add:
  - **B21 — RealtimeBridge invalidation coalescing (audit B/C, DEFERRED by debate):** identical queries fire 2–3× per load because `RealtimeBridge` calls `invalidateQueries` on ANY event across 8 tables/6 query keys. Design (from the draft spec): pure `makeTrailingCoalescer(delayMs, fn)` in `src/lib/coalesce.ts`, coalesce per query key (`queryKey.join('|')`, 3s trailing), cleanup clears timers; in-repo precedent `scheduleRefetch` (`WhatsAppChat.tsx`). Done = duplicate-request volume measurably down AND a documented rollback (revert one commit); require a before/after egress or request-count measurement.
  - **B22 — server-side conversation-list RPC/view:** the preview query's explicit 1000-row cap is a *message* window, not a *conversation* window; a `DISTINCT ON ("Sender Number") … ORDER BY created_at DESC` view/RPC is the real fix.
  - **B23 — the dead client-side document upload (mammoth/pdfjs/bluebird):** former `'unsafe-eval'` consumer; W5 found it dead (no INSERT policy). Delete it, or revive with an INSERT policy + bundled pdf worker (`?url` import — the cdnjs URL 404s on pdf.js 5.x, W9) + re-add `'unsafe-eval'`. Until then `.docx` parsing throws if the paperclip path is revived.
  - Append to **B12**: the production CSP header belongs in CloudPanel's stored vhost template (B11 reverts hand-edits at cert renewal); hand over the exact header value from `public/serve.json`. Until then the meta CSP (minus frame-ancestors) is production's only CSP, and production's clickjacking protection is `X-Frame-Options: SAMEORIGIN` from `/etc/nginx/global_settings`.
- [x] **Step 2:** In the spec's Status header, replace `DRAFT — awaiting review` with `EXECUTED 2026-09-02 as amended by the Codex debate — see docs/superpowers/plans/2026-09-02-e2e-audit-remediation.md`, and record the audit corrections (audit #1 does not reproduce — the checkbox is label-wrapped; the audit's "zero console errors" was false in Chrome; the e2e-kit `tests/flows/` dir is not empty).
- [x] **Step 3:** Commit: `docs: E2E-audit closeout — B21-B23, B12 handoff, audit corrections` (landed as `5cb657f`)

## Verification (end-to-end)

1. Per task: gates + named spec + frozen-file diff guard (Global Constraints).
2. Task 10 is the only serve.json change → `PW_BUILD=1 … --workers=1` there and again in Task 11.
3. The deploy script's own assertions (now incl. CSP) gate Task 11; live curls after.
4. Final acceptance is the independent kit at `/root/projects/e2e-kit`: 36 executed / 0 failed / 13 skipped, no visual diffs.

---

## Follow-on — 2026-09-03 (appended; the plan above is the 2026-09-02 record)

This plan's Task 11 deployed to **testing** only. The same tree was promoted to production on
2026-09-03 (`ab2d88b`, from staging `d42e448`), and the operator handoff this plan left open —
"the production CSP header belongs in the CloudPanel template" — was completed the same day.

Production now serves the CSP as an HTTP header plus the `no-cache` / `immutable` cache pair,
from CloudPanel's stored per-site template. The e2e kit against `https://2s-dashboard.digitlab.ai`
went from 32 passed / 2 failed to **34 passed / 0 failed**; the two tests that flipped are
`tests/api/headers.spec.js` "frame-ancestors is delivered as an HTTP header" and
`tests/api/spa-routing.spec.js` "index.html is served with a no-cache policy".

The vhost's first draft passed `nginx -t` and still carried a blocker — `always` on the
`/assets/` `Cache-Control`, which would have cached 404s as `immutable` for a year in users'
browsers. Adversarial review caught it and reproduced it on a sandbox nginx. Written up as
`docs/testing-lessons.md` §16 and `docs/backlog.md` B12; the remaining gap, that the vhost copy of
the CSP is not in git and nothing compares it to `serve.json`, is B24.
