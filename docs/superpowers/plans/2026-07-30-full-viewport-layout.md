# Full-Viewport Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No document-level vertical scrollbar on the landing page and dashboard pages; content fills the viewport, overflow lives inside panels/cards. WhatsApp (`/dashboard/whatsapp`) and Sera Email (`/dashboard/email`) pages stay pixel-identical.

**Architecture:** Route-conditional `DashboardShell`: locked `h-svh` layout for in-scope routes, today's document-flow layout for the two excluded routes. Analytics pages convert `space-y-6` stacks into `flex h-full flex-col` with chart rows flexing to absorb remaining height (`ResponsiveContainer height="100%"` via a ChartCard fill variant). Hotel Training's wizard column becomes an internal scroll area. Below `lg`, `main` scrolls internally (never the document).

**Tech Stack:** React 18 + Tailwind (shadcn), Recharts, Playwright (mocked auth/REST helpers in `tests/helpers/hotel-training-mocks.ts`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-30-full-viewport-layout-design.md`.
- CSS/layout only — no data, query, or edge-function changes.
- Zero edits to `src/pages/dashboard/WhatsApp.tsx`, `src/pages/dashboard/Email.tsx`, `src/pages/WhatsAppLanding.tsx`.
- One task per commit, directly on `main`, conventional style `type(scope): summary`, footer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Release checks: `npm run lint`, `npm run build`, `npx tsx --test tests/unit/*.test.ts`, `npm run test:e2e`.
- Must hold at 1920×1080, 1366×768 (true fit, nothing scrolls) and the mobile breakpoint (document never scrolls; `main` scrolls internally below `lg`).

## Deviation from spec (recorded)

The spec sketched "step indicator pins top, nav buttons pin bottom" for Hotel Training. The wizard's nav buttons live **inside** `TrainingDetailsForm` / `ParticipantsStep` / `ConfirmationStep` (they are form-submit buttons); pinning them would mean restructuring three child components. Instead the whole wizard column becomes the internal scroll area — same "overflow inside panels" compliance, no child restructuring. Recorded in the before/after deliverable.

---

### Task 1: Delete dead `src/App.css`

**Files:**
- Delete: `src/App.css`

`src/App.css` is unimported Vite boilerplate (`#root { max-width: 1280px; padding: 2rem; text-align: center }`) that would fight the locked layout if ever imported. Only `./index.css` is imported in `src/main.tsx`.

- [ ] **Step 1: Verify it is dead**

Run: `grep -rn "App.css" src/ index.html`
Expected: no matches (nothing imports it).

- [ ] **Step 2: Delete and verify build**

```bash
rm src/App.css
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A src/App.css
git commit -m "chore(dashboard): delete dead App.css (unimported Vite boilerplate)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `short:` Tailwind variant + ChartCard `fill` variant

**Files:**
- Modify: `tailwind.config.ts` (theme.extend)
- Modify: `src/components/dashboard/ChartCard.tsx`

**Interfaces:**
- Produces: Tailwind variant `short:` active when `(max-height: 800px)`; `<ChartCard fill …>` — card `flex flex-col min-h-0 h-full`, body `flex-1 min-h-0`, so a child `ResponsiveContainer width="100%" height="100%"` fills the card. Non-fill usage unchanged (WhatsApp/Email pages keep rendering identically).

- [ ] **Step 1: Add the `short` screen**

In `tailwind.config.ts`, inside `theme.extend` (NOT the top-level `container.screens`), add:

```ts
			screens: {
				short: { raw: '(max-height: 800px)' },
			},
```

Note: `extend.screens` appends to the default sm/md/lg/xl/2xl set; the raw variant generates `short:` classes.

- [ ] **Step 2: Add the ChartCard fill variant**

Replace the component body of `src/components/dashboard/ChartCard.tsx` with:

```tsx
interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  /** Fill parent height: card becomes a min-h-0 flex column and the chart
      body flexes, so ResponsiveContainer height="100%" works inside it. */
  fill?: boolean;
}

export const ChartCard: React.FC<ChartCardProps> = ({ title, description, children, className, action, fill }) => {
  return (
    <Card
      className={cn(
        'bg-card-gradient border border-border/60 shadow-card-soft p-5 short:p-4 animate-fade-in',
        fill && 'flex h-full min-h-0 flex-col',
        className,
      )}
    >
      <div className={cn('flex items-start justify-between mb-4 short:mb-2 gap-3', fill && 'shrink-0')}>
        <div>
          <h3 className="font-display font-semibold text-base">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      <div className={cn('w-full', fill && 'min-h-0 flex-1')}>{children}</div>
    </Card>
  );
};
```

(The `short:p-4`/`short:mb-2` densification applies to ALL ChartCards including excluded pages — **that violates "zero edits" in effect**. To keep excluded pages pixel-identical, gate the density on `fill` too: use `fill ? 'p-5 short:p-4' : 'p-5'` and `fill ? 'mb-4 short:mb-2' : 'mb-4'`. Implement it gated.)

- [ ] **Step 3: Verify build + excluded pages unaffected**

```bash
npm run lint && npm run build
```
Expected: clean. `grep -n "fill" src/pages/dashboard/WhatsApp.tsx src/pages/dashboard/Email.tsx` → no matches (they never pass `fill`, so their rendering is byte-identical).

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts src/components/dashboard/ChartCard.tsx
git commit -m "feat(dashboard): add short viewport variant and ChartCard fill mode

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Route-conditional locked layout in DashboardShell

**Files:**
- Modify: `src/layouts/DashboardShell.tsx`

**Interfaces:**
- Produces: on locked routes, `<main>` is `h-full`-constrained (`flex-1 min-h-0 overflow-y-auto lg:overflow-hidden`), so page roots can use `h-full`. Legacy routes (`/dashboard/whatsapp`, `/dashboard/email`) render today's exact classes.

- [ ] **Step 1: Implement**

```tsx
import { Outlet, Link, useLocation } from 'react-router-dom';
// ... existing imports unchanged

// These two routes keep the original document-flow layout (page scrolls at
// the document level, sticky header). Everything else is locked to the
// viewport: the document can never scroll; below lg, <main> scrolls instead.
const LEGACY_SCROLL_ROUTES = ['/dashboard/whatsapp', '/dashboard/email'];

export const DashboardShell: React.FC = () => {
  const { pathname } = useLocation();
  const legacy = LEGACY_SCROLL_ROUTES.includes(pathname);

  return (
    <DateRangeProvider>
      <RealtimeBridge />
      <SidebarProvider defaultOpen={true} className={legacy ? undefined : 'h-svh overflow-hidden'}>
        <div className={legacy ? 'min-h-screen flex w-full bg-background' : 'h-full flex w-full bg-background'}>
          <AppSidebar />

          <div className={legacy ? 'flex-1 flex flex-col min-w-0' : 'flex-1 flex flex-col min-w-0 min-h-0'}>
            <header className="h-14 border-b border-border bg-card/40 backdrop-blur flex items-center justify-between px-4 sticky top-0 z-30 shrink-0">
              {/* ...header content byte-identical to current... */}
            </header>

            <div className="flex-1 flex min-h-0">
              <main className={legacy ? 'flex-1 overflow-y-auto p-3 sm:p-6' : 'flex-1 min-h-0 overflow-y-auto lg:overflow-hidden p-3 sm:p-6 short:p-3'}>
                <Outlet />
              </main>
              <RightChatPanel />
            </div>
          </div>
        </div>
      </SidebarProvider>
    </DateRangeProvider>
  );
};
```

Notes for the implementer:
- `SidebarProvider` (shadcn `src/components/ui/sidebar.tsx`) accepts `className` and merges it onto its `min-h-svh` wrapper div; `h-svh overflow-hidden` caps it (`h-svh` wins over `min-h-svh` when equal, and `overflow-hidden` guarantees no document scroll even during transient overflow).
- `shrink-0` on the header is new but inert in the legacy path (header already never shrank in a `min-h-screen` column; verify visually via the excluded-page Playwright assertions in Task 4).
- Keep the header JSX byte-identical otherwise.
- `RightChatPanel`'s desktop aside uses `h-[calc(100%-1.5rem)] self-start mt-6`; in locked mode the flex row is viewport-bounded, so this resolves to viewport height minus margin. After implementing, open `/dashboard` and `/dashboard/whatsapp` with the chat panel open and confirm the panel and its history sidebar scroll internally in both modes.

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run build && npm run test:e2e -- --project=chromium tests/hotel-training.spec.ts
```
Expected: all pass (existing e2e exercises the shell on a locked route).

- [ ] **Step 3: Commit**

```bash
git add src/layouts/DashboardShell.tsx
git commit -m "feat(dashboard): route-conditional viewport-locked shell layout

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Playwright full-viewport spec (fails on unrefitted pages — the TDD arc for Tasks 5–9)

**Files:**
- Create: `tests/full-viewport.spec.ts`

**Interfaces:**
- Consumes: `setMockAuthSession`, `mockSupabaseRest`, `mockColleaguesFunction`, `mockColumnsFunction`, `mockTrainersFunction` from `tests/helpers/hotel-training-mocks.ts`.
- Produces: the acceptance gate each page-refit task turns green, route by route.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, type Page } from '@playwright/test';
import {
  setMockAuthSession,
  mockSupabaseRest,
  mockColleaguesFunction,
  mockColumnsFunction,
  mockTrainersFunction,
} from './helpers/hotel-training-mocks';

const IN_SCOPE = [
  '/dashboard',
  '/dashboard/reviews',
  '/dashboard/competitors',
  '/dashboard/info-email',
  '/dashboard/social',
  '/dashboard/welcome',
  '/dashboard/hotel-training',
];
const EXCLUDED = ['/dashboard/whatsapp', '/dashboard/email'];
const DESKTOP_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
];

async function openPage(page: Page, route: string) {
  await setMockAuthSession(page);
  await mockSupabaseRest(page);
  await mockColleaguesFunction(page);
  await mockColumnsFunction(page);
  await mockTrainersFunction(page);
  await page.goto(route);
  await page.waitForLoadState('networkidle');
}

async function documentOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
}

async function mainOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('no <main> found');
    return main.scrollHeight - main.clientHeight;
  });
}

test.describe('full-viewport layout (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only assertions');

  for (const size of DESKTOP_SIZES) {
    for (const route of IN_SCOPE) {
      test(`${route} fits ${size.width}x${size.height}`, async ({ page }) => {
        await page.setViewportSize(size);
        await openPage(page, route);
        expect(await documentOverflow(page)).toBeLessThanOrEqual(1);
        expect(await mainOverflow(page)).toBeLessThanOrEqual(1);
      });
    }
  }

  // Excluded pages: document-level scroll must KEEP working exactly as
  // before. At 1366x768 both pages are taller than the viewport even with
  // empty mocked data (KPI row + 3 chart cards ≈ 950px+).
  for (const route of EXCLUDED) {
    test(`${route} still scrolls at document level (unchanged)`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await openPage(page, route);
      expect(await documentOverflow(page)).toBeGreaterThan(0);
    });
  }
});

test.describe('full-viewport layout (mobile)', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile-only assertions');

  for (const route of [...IN_SCOPE, ...EXCLUDED]) {
    test(`${route} document does not scroll on mobile`, async ({ page }) => {
      await openPage(page, route);
      if (EXCLUDED.includes(route)) {
        // Excluded pages keep document flow on every viewport — only assert
        // the page still renders (no layout assertion).
        await expect(page.locator('main')).toBeVisible();
        return;
      }
      expect(await documentOverflow(page)).toBeLessThanOrEqual(1);
      // main MAY scroll internally on mobile — no mainOverflow assertion.
    });
  }
});
```

- [ ] **Step 2: Run — expect partial failure**

Run: `npm run test:e2e -- tests/full-viewport.spec.ts`
Expected: EXCLUDED tests PASS (shell legacy path works); IN_SCOPE fit tests FAIL for `/dashboard`, `/dashboard/reviews`, `/dashboard/competitors`, `/dashboard/info-email`, `/dashboard/social`, `/dashboard/hotel-training` at 1366×768 (pages not yet refitted; `main` overflows). `/dashboard/welcome` may already pass at 1080p. Record which fail — that list drives Tasks 5–9.

- [ ] **Step 3: Commit**

```bash
git add tests/full-viewport.spec.ts
git commit -m "test(dashboard): add full-viewport layout spec (red for unrefitted pages)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Refit Overview

**Files:**
- Modify: `src/pages/dashboard/Overview.tsx`

The shared refit pattern (used in Tasks 5–8), exactly:

1. Page root: `space-y-6 …` → `flex h-full min-h-0 flex-col gap-4 short:gap-3 …` (keep `animate-fade-in` where present).
2. Chart rows: add `flex-1 min-h-0` to the grid className, add `fill` to each ChartCard inside, and replace `<ResponsiveContainer width="100%" height={chartHeight}>` with a mobile-conditional: `<ResponsiveContainer width="100%" height={isMobile ? chartHeight : '100%'} minHeight={isMobile ? undefined : 160}>` — on mobile (`main` scrolls) charts keep fixed heights; on desktop they fill.
3. Fixed sections (SectionHeader, KPI grids) get `shrink-0`.

- [ ] **Step 1: Apply to Overview**

- Root div: `space-y-6 animate-fade-in` → `flex h-full min-h-0 flex-col gap-4 short:gap-3 animate-fade-in`.
- KPI grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` → same + ` short:gap-2 shrink-0`.
- Chart row: `grid grid-cols-1 lg:grid-cols-2 gap-4` → `grid grid-cols-1 lg:grid-cols-2 gap-4 lg:flex-1 lg:min-h-0` and both ChartCards get `fill`; both ResponsiveContainers per pattern step 2.
- Quick-links Card: `p-5` → `p-5 short:p-3 shrink-0`; heading `mb-3` → `mb-3 short:mb-2`; link grid `grid grid-cols-2 md:grid-cols-4 gap-2` → `grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2` and each link `px-3 py-2.5` → `px-3 py-2.5 short:py-1.5` (7-across on xl+ makes it a single compact strip).

Note: `lg:flex-1 lg:min-h-0` (not unconditional) — below `lg` the row keeps natural height and `main` scrolls.

- [ ] **Step 2: Verify route green**

Run: `npm run test:e2e -- tests/full-viewport.spec.ts -g "/dashboard "`
(If `-g` matching is fiddly because `/dashboard` prefixes other routes, run the whole spec file and check the three `/dashboard fits`/mobile tests.)
Expected: `/dashboard` tests PASS at both desktop sizes + mobile.

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashboard/Overview.tsx
git commit -m "feat(dashboard): fit Overview to viewport (flex charts, compact quick links)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Refit Reviews + InfoEmail + Social + Welcome (one commit per page)

**Files:**
- Modify: `src/pages/dashboard/Reviews.tsx`, `src/pages/dashboard/InfoEmail.tsx`, `src/pages/dashboard/Social.tsx`, `src/pages/dashboard/Welcome.tsx`

Each page follows the shared refit pattern from Task 5 verbatim. Per-page specifics — every page: root `space-y-6` → `flex h-full min-h-0 flex-col gap-4 short:gap-3`; KPI grid + SectionHeader `shrink-0`; ALL ResponsiveContainers get the mobile-conditional height.

- **Reviews.tsx** (two chart rows): row 1 (`lg:grid-cols-3`, Daily volume + Source pie) and row 2 (Score distribution) each get `lg:flex-1 lg:min-h-0`; all three ChartCards `fill`.
- **InfoEmail.tsx** (two chart rows): same treatment — row 1 `lg:grid-cols-3` (Action pie + Forwarded bars), row 2 (Confidence bar); three ChartCards `fill`.
- **Social.tsx** (two chart rows): row 1 `lg:grid-cols-2` (two pies), row 2 (Conversation nature); three ChartCards `fill`.
- **Welcome.tsx** (one chart row): the single `lg:grid-cols-3` row gets `lg:flex-1 lg:min-h-0`; both ChartCards `fill`.

- [ ] **Step 1: Refit Reviews.tsx per above** → run `npm run test:e2e -- tests/full-viewport.spec.ts` → `/dashboard/reviews` tests PASS → commit `feat(dashboard): fit Reviews to viewport`
- [ ] **Step 2: Refit InfoEmail.tsx** → route tests PASS → commit `feat(dashboard): fit Info Email to viewport`
- [ ] **Step 3: Refit Social.tsx** → route tests PASS → commit `feat(dashboard): fit Social to viewport`
- [ ] **Step 4: Refit Welcome.tsx** → route tests PASS → commit `feat(dashboard): fit Welcome to viewport`

(Each commit with the standard footer, files added individually.)

---

### Task 7: Refit Competitors

**Files:**
- Modify: `src/pages/dashboard/Competitors.tsx`

Same shared pattern; specifics: 4 KPI cards + full-width Rate-trend LineChart + `lg:grid-cols-2` row of two horizontal-bar charts. Give the trend row `lg:flex-[3] lg:min-h-0` and the bar row `lg:flex-[2] lg:min-h-0` (trend deserves more height; 3:2 split of remaining space), all three ChartCards `fill`, mobile-conditional heights. If the Legend crowds at 1366×768 (~250px trend chart), reduce Legend `wrapperStyle` fontSize to 10 — layout only, no data changes.

- [ ] **Step 1: Apply refit**
- [ ] **Step 2: Verify** — `/dashboard/competitors` tests PASS at both desktop sizes + mobile.
- [ ] **Step 3: Commit** — `feat(dashboard): fit Competitors to viewport`

---

### Task 8: Refit Hotel Training (internal-scroll wizard)

**Files:**
- Modify: `src/pages/dashboard/HotelTraining.tsx` (root div ~line 435, wizard content div ~line 320, Tabs ~line 439)

No changes to `TrainingDetailsForm`, `ParticipantsStep`, `ConfirmationStep`, `AdminPanel` component files.

- [ ] **Step 1: Apply**

- Page root (~line 435): `space-y-6` → `flex h-full min-h-0 flex-col gap-6 short:gap-4`; `SectionHeader` wrapper unchanged (it renders inline; add `shrink-0` via a wrapping div only if SectionHeader's root can't take className — check `src/components/dashboard/SectionHeader.tsx`; if it accepts className, pass `shrink-0`).
- `registerTrainingContent` root div (`mx-auto max-w-2xl space-y-6`) → `mx-auto w-full max-w-2xl space-y-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1` — the wizard column itself is the internal scroll area on desktop (`pr-1` keeps the scrollbar off the content). Below `lg`, `main` scrolls as before.
- Non-admin branch renders `registerTrainingContent` directly — it already has the classes.
- Admin branch: `<Tabs defaultValue="register">` → `<Tabs defaultValue="register" className="lg:min-h-0 lg:flex-1 lg:flex lg:flex-col">`; both `TabsContent` elements get `className="pt-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"` (register content's own overflow class is then redundant but harmless — Radix TabsContent unmounts inactive tabs, so only one scroll area is live; keep both for simplicity). `TabsList` gets `shrink-0` implicitly (natural height in a flex column — no class needed).
- The success state (`mx-auto flex max-w-2xl … py-10`) fits trivially; add `lg:min-h-0 lg:flex-1 lg:overflow-y-auto` for symmetry only if the full-viewport test flags it.

- [ ] **Step 2: Verify**

```bash
npm run test:e2e -- tests/full-viewport.spec.ts
npm run test:e2e -- --project=chromium tests/hotel-training.spec.ts
```
Expected: `/dashboard/hotel-training` fit tests PASS; the entire existing hotel-training spec stays green (wizard flows, admin tab, submit capture).

- [ ] **Step 3: Commit** — `feat(dashboard): fit Hotel Training to viewport (internal-scroll wizard)`

---

### Task 9: Full verification + publish + before/after list

**Files:**
- Modify: `docs/superpowers/plans/2026-07-30-full-viewport-layout.md` (append the before/after list as an appendix) — or deliver in the final chat report; the chat report is the required deliverable.

- [ ] **Step 1: Full check suite**

```bash
npm run lint
npx tsx --test tests/unit/*.test.ts
npm run test:e2e
npm run build
```
Expected: all green. `npm run test:e2e` runs chromium + mobile-chrome including `manual-checklist.spec.ts` (horizontal overflow) and `hotel-training.spec.ts`.

- [ ] **Step 2: Publish**

`npm run build` (already run) rebuilds `dist/` in place — the served site is this htdocs directory. Confirm `dist/` mtime updated.

- [ ] **Step 3: Commit any stragglers + assemble the page-by-page before/after list** for the final report (route; what changed; where overflow now lives).
