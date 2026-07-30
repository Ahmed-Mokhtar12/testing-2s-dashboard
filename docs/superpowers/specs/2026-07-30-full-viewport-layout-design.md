# Full-Viewport Layout — Design Spec

**Date:** 2026-07-30
**Project:** Two Seasons Insights Dashboard
**Feature:** Lock the dashboard to the viewport — no document-level vertical scrollbar; overflow lives inside panels/cards

---

## Overview

Nothing in the app locks height today: `DashboardShell` uses `min-h-screen` (and shadcn's
`SidebarProvider` wrapper uses `min-h-svh`), `html/body/#root` get `height: 100%` with no
overflow rules, so every page grows the document and scrolls at the body level. `main`'s
existing `overflow-y-auto` never becomes a real scroll container.

This feature converts the shell to a height-locked layout on in-scope routes and refits each
in-scope page so its content fills the viewport exactly, with any overflow handled inside
panels/cards. The WhatsApp and Sera Email pages are excluded and stay pixel-identical.

**CSS/layout work only** — no data, query, or edge-function changes.

---

## Decisions Made

| Topic | Decision |
|---|---|
| Shell strategy | **Route-conditional**: locked `h-svh` layout for in-scope routes; the two excluded routes keep today's document-flow layout, pixel-identical (user-approved over a global lock). |
| Excluded routes | `/dashboard/whatsapp` (`WhatsApp.tsx`) and `/dashboard/email` (`Email.tsx`, "Sera Sent Emails"). `WhatsAppLanding` (`/whatsapp`, `/whatsapp-inbox`) is outside the shell and already viewport-locked — untouched. |
| Mobile (<`lg`) | Content scrolls **inside `main`** (header + sidebar fixed, document never scrolls). Applies to all in-scope pages: stacked single-column cards cannot fit a phone viewport, and shrinking charts further would make them useless. User-approved as the answer to "which pages can't fit small viewports". |
| Short desktops | A `short` Tailwind variant (`@media (max-height: 800px)`) tightens paddings/gaps so 1366×768 fits without cramping 1920×1080. |
| Tall content | Internal scroll areas inside cards (Hotel Training step body, any long list). Never the document. |
| Dead code | `src/App.css` (unimported Vite boilerplate) deleted as its own commit. |

---

## Shell Changes (`src/layouts/DashboardShell.tsx`)

An explicit route list drives the mode:

```ts
const LEGACY_SCROLL_ROUTES = ['/dashboard/whatsapp', '/dashboard/email'];
```

**Legacy mode (excluded routes):** exactly today's classes — root `min-h-screen flex w-full`,
sticky `h-14` header, `main` `flex-1 overflow-y-auto p-3 sm:p-6`, document-level scroll.

**Locked mode (all other routes):**

- SidebarProvider wrapper / shell root: `h-svh overflow-hidden` (replacing `min-h-*`).
- Content column: add `min-h-0` to the existing `flex-1 flex flex-col min-w-0`.
- Content row below header: keeps `flex-1 flex min-h-0`.
- `main`: `flex-1 min-h-0 p-3 sm:p-6` + `overflow-y-auto lg:overflow-hidden` — below `lg`
  it is the internal scroll container; at `lg+` pages must fit and nothing scrolls.
- Header (`h-14`, sticky) unchanged — sticky is inert in a non-scrolling ancestor.

**RightChatPanel:** currently `h-[calc(100%-1.5rem)] self-start` sized against a
content-height row. In locked mode the row is viewport-bounded so this resolves correctly;
implementation must verify the panel and its internal `SeraHistorySidebar` scroll still work
in both modes (add `min-h-0` where needed, no visual redesign).

---

## Per-Page Refits (in scope: 7 pages)

Shared pattern for analytics pages (Overview, Reviews, Competitors, Social, InfoEmail,
Welcome): root `space-y-6` → `flex h-full min-h-0 flex-col gap-4 short:gap-3`;
SectionHeader and KPI grid keep natural height; each chart row gets `flex-1 min-h-0`; each
`ChartCard` in a flexing row gets a **fill variant** (card `flex flex-col min-h-0`, body
`flex-1 min-h-0`, `ResponsiveContainer width="100%" height="100%"` instead of fixed
`chartHeight`). Charts absorb exactly the remaining height. The `isMobile` fixed heights
remain for the `<lg` internal-scroll flow.

| Page | Current (before) | Refit (after) |
|---|---|---|
| `Overview.tsx` | Header + 7 KPI tiles + 2-chart row + quick-links card; ~950px; overflows 768p | KPI grid fixed; chart row `flex-1`; quick-links becomes a compact horizontal strip (single row, `short:` denser) — the one section that must shrink for 768p |
| `Reviews.tsx` | 4 KPIs + 2 chart rows; ~950px | Both chart rows flex to share remaining height |
| `Email.tsx` | — | **Excluded, untouched** |
| `InfoEmail.tsx` | 4 KPIs + 2 chart rows; ~950px | Same flex treatment |
| `Competitors.tsx` | 4 KPIs + full-width trend + 2-chart row; ~1050px | Two chart rows share remaining height (~225px each at 768p — acceptable) |
| `Social.tsx` | 4 KPIs + 2 chart rows; ~950px | Same flex treatment |
| `Welcome.tsx` | 4 KPIs + 1 chart row; ~620px; already fits 1080p | Chart row flexes; trivial |
| `HotelTraining.tsx` | Wizard, natural flow; step 2 participant list unbounded (20 rows ≈ 1600px) | Root `h-full min-h-0 flex flex-col`; wizard keeps `mx-auto max-w-2xl`; step indicator pins top, nav buttons pin bottom; **step body becomes the internal scroll area** (`flex-1 min-h-0 overflow-y-auto`) so long participant lists / confirmation lists scroll inside the card. Admin tab (Manage Members) gets the same treatment. |
| `WhatsApp.tsx` | — | **Excluded, untouched** |

The `short` variant is added to `tailwind.config.ts` `screens` as
`short: { raw: '(max-height: 800px)' }`.

---

## Verification (Playwright)

New `tests/full-viewport.spec.ts` using the existing mock helpers
(`setMockAuthSession`, per-function mocks, REST catch-all) with **seeded generous data**
(long tables, many chart points, 15-participant training draft) so real heights are
exercised — empty-state fits prove nothing.

Assertions:

- Each in-scope route × {1920×1080, 1366×768}:
  `document.documentElement.scrollHeight <= window.innerHeight + 1` **and**
  `main.scrollHeight <= main.clientHeight` (nothing scrolls at desktop).
- Each in-scope route × Pixel-7 project: document must not scroll; `main` may.
- Excluded routes (`/dashboard/whatsapp`, `/dashboard/email`) with tall mocked data:
  `document.documentElement.scrollHeight > window.innerHeight` — regression-locking their
  current document-scroll behavior.
- Existing `tests/manual-checklist.spec.ts` horizontal-overflow assertions stay green.

Release checks per house convention: `npm run lint`, `npm run build`,
`npx tsx --test tests/unit/*.test.ts`, targeted `npm run test:e2e`.

---

## Deliverable

Page-by-page before/after list (the table above, updated with what actually changed),
plus the Playwright spec described above. One task per commit, on `main`.

## Out of Scope / Non-Goals

- No data, query, or edge-function changes.
- No visual redesign of any component beyond spacing/height mechanics.
- `WhatsApp.tsx`, `Email.tsx`, `WhatsAppLanding.tsx`: zero edits.
- No changes to the Sera chat panel's internal UI (only height-chain correctness).

## Rollback

Pure frontend commits — revert the commit range and rebuild `dist/` (`npm run build`).
