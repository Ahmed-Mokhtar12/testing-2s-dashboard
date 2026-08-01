# Cleanup inventory — Lovable leftovers and dead code

**Date:** 2026-07-31 · **Scope when written:** read-only — every row was a
recommendation with the evidence behind it. **Partly executed the same day;**
see the status block immediately below before reading anything as pending.

---

## STATUS — 2026-07-31 evening

Ahmed's first ruling was to do the two no-judgement tiers and hold the large
frontend deletion until after the n8n reviews backfill ("I'd rather not have a
large deletion commit in flight while I'm running things by hand in n8n"). He
released the held tier later the same day, so everything except `lovable-tagger`
is now executed.

| Tier | State |
|---|---|
| The four zero-reference deletions | **DONE** — `chore(cleanup): delete four zero-reference Lovable scaffold leftovers` |
| The 12 dead `chat-with-data` modules | **DONE** — `chore(chat-with-data): delete 12 unreachable modules and pin the import graph` |
| The 21 unused components + 16 dependencies | **DONE** — released by Ahmed and executed the same day |
| The 3 dead non-UI frontend files | **DONE** — same commit as the components |
| `lovable-tagger` | **STILL A DECISION, THE ONLY ONE LEFT** — see below |
| `public/og-image.png` | **STILL WORTH ONE LOOK** — it is served as the social preview; only a human can say whether the artwork is still the Lovable default |

Measured outcome of the component tier, rather than the estimate this document
originally carried:

| | before | after |
|---|---|---|
| `package.json` direct dependencies | 72 | **56** |
| packages in the tree | — | **19 removed** (16 direct + 3 transitive) |
| `node_modules` | 532 MB | **527 MB** |
| `dist` total | 4.6 MB | **4.6 MB — unchanged** |

The `dist` row is the point. This document predicted no bundle-size win because
Vite already tree-shakes unimported components, and deleting 23 source files and
19 packages moved the built output by less than the rounding. The estimate of
"3.7 MB of node_modules" was slightly low; the measured delta is ~5 MB, since
removing 16 direct dependencies also dropped 3 transitive ones.

Also confirmed, having done it: deleting `form.tsx` did **not** free
`react-hook-form`, `@hookform/resolvers` or `zod`, and deleting `chart.tsx` did
not free `recharts`. All four still have live importers (3, 3, 3 and 8
respectively), exactly as predicted below.

One trap this tier repeated: `ui/toggle.tsx` looks live to a per-file grep,
because `ui/toggle-group.tsx` imports `toggleVariants` from it — and nothing
imports `toggle-group`. Same self-referencing-dead-cluster shape as the four
dead `chat-with-data` modules. A one-way "does anything import this?" check
keeps both.

### `lovable-tagger` — the last open decision

Not deleted, deliberately, because it is the only item here that removes a
capability rather than dead weight: it is what lets Lovable's visual editor map
the rendered DOM back to source, so deleting it means this project can no longer
be opened there usefully. It is a devDependency gated on `mode === 'development'`
in `vite.config.ts`, so it never reaches production and there is no security or
performance argument either way. One line in `vite.config.ts` plus one
`npm uninstall` whenever the answer is "Lovable is retired for this project".

Two things learned while executing that the read-only pass had not established:

- **The `public/` items really were shipping.** Vite copies `public/`
  verbatim instead of tree-shaking it, so `dist/lovable-uploads/` and
  `dist/placeholder.svg` existed in the built output before and do not after.
  This is the opposite of the 21 components, where there is genuinely no
  bundle-size argument. Small (28 KB), but real, unlike the other tier.
- **Two of the three PNGs are byte-identical to `public/favicon.png`**
  (md5 `f2de3908…`), which `index.html` does reference. So the brand mark was
  never at risk; only the third file's exact bytes left the tree, and git
  history keeps those.

There was **no local type-check protecting the edge deletion** — `tsconfig.app`
and `tsconfig.node` exclude `supabase/functions`, and deno is not installed on
this host. `tests/unit/edge-imports-resolve.test.ts` was added with that commit
so the next such deletion is checked by the suite rather than by hand.

A third finding fell out of writing that test: `npm run test:unit` globbed only
`tests/unit/*.test.ts`, so
`supabase/functions/chat-with-data/training-aggregator.test.ts` — 14 passing
assertions — had never been run by any command in this repo. Now wired in
(124 → 138). That is the inverse of dead code: live tests nobody executes. This
sweep did not look for more of them, so there may be others.

Method, so the rulings can be checked rather than trusted:

- **Frontend dead code** — import-graph reachability from `src/main.tsx`,
  resolving `@/` and relative specifiers across `.ts/.tsx/.jsx/.js` plus
  `index.*` directory imports. Anything not reachable was then grepped for by
  name across `src/`, `tests/` and `docs/` to catch dynamic or string-based
  references. 156 files, 132 reachable, 24 not.
- **Edge dead code** — the same analysis over `supabase/functions`, with each
  function's `index.ts` as an entry point. 77 non-test files, 65 reachable,
  12 not.
- **Dependencies** — a package is called dead only if every file importing it
  is itself unreachable. Checked against `tailwind.config.ts` and
  `vite.config.ts` as well as `src/`, because a build-time-only dependency
  looks unused if you only scan source.

---

## Point 2 — Lovable leftovers

### Already clean (verified, no action)

| Item | Evidence |
|---|---|
| `index.html` | No Lovable meta tags. Own title/description/`og:url`, and a real CSP with `frame-ancestors 'none'`. Someone already did this. |
| `README.md` | 79 lines of project-specific docs. No scaffold boilerplate. |
| `src/App.css` | Gone (deleted during the viewport work). |
| `bun.lockb` | Absent — only `package-lock.json`. No dual-lockfile hazard. |
| `*-old.ts`, `*.bak` | None anywhere in `src/` or `supabase/`. |

### Delete — zero references, no decision needed — **ALL FOUR DELETED 2026-07-31**

| Item | Size | Evidence |
|---|---|---|
| `public/lovable-uploads/` (3 PNGs) | 28 KB | Zero references in `src/`, `index.html`, or anywhere in `public/`. Scaffold upload dump from 2026-06-03. |
| `public/placeholder.svg` | — | Zero references. |
| `next-themes` dependency | 44 KB installed | Referenced nowhere in the repo except its own `package.json` line. Not imported by `sonner.tsx` or anything else. |
| `src/components/ui/use-toast.ts` | 82 bytes | A pure re-export of `@/hooks/use-toast`. Nothing imports it; every caller imports the hook directly. |

### Needs a decision

| Item | Trade-off |
|---|---|
| `lovable-tagger` + `componentTagger()` in `vite.config.ts` — **STILL OPEN** | devDependency, and gated on `mode === 'development'`, so it never reaches production. It injects element attributes that let Lovable's visual editor map the DOM back to source. Delete if the Lovable editor is retired for this project; keep if you might open it there again. No security or performance argument either way. |
| 21 unimported shadcn/ui components + the 16 dependencies only they use — **DELETED** | See Point 3 for the list. **There is no bundle-size argument** — I checked `dist/assets/*.js` for `NavigationMenu`, `Menubar`, `HoverCard`, `InputOTP` and `ResizablePanel` and all five appear in **zero** built chunks; Vite already tree-shakes them. The real costs are 3.7 MB of `node_modules`, install and CI time, 16 more packages of supply-chain surface, and 64 KB of source that a reviewer has to skip past. The real cost of deleting is that re-adding one means `npx shadcn add <name>` again. |
| `package.json` name `vite_react_shadcn_ts` | Cosmetic only — `private: true`, never published. |
| `public/og-image.png` | **Referenced** by `og:image` and `twitter:image`, so it is being served as the dashboard's social preview. Keep the file — but worth opening it once to confirm it is not still the Lovable default artwork, which I cannot judge from the bytes. |

### Keep

`components.json` (shadcn config — needed for `shadcn add`), `favicon.ico`,
`favicon.png`, `robots.txt`.

---

## Point 3 — dead and orphaned code

### Frontend: 24 unreachable files — **ALL 24 DELETED 2026-07-31**

**3 non-UI files, 2,979 bytes.** Unreachable from `main.tsx`, and grep finds
**zero** occurrences of their names anywhere in `src/`, `tests/` or `docs/`:

- `src/components/whatsapp/WhatsAppHeader.tsx`
- `src/utils/fileUploadHandler.ts`
- `src/utils/testActionService.ts`

**21 shadcn/ui components, 64,170 bytes.** The full scaffold set minus what the
app actually uses: `accordion`, `aspect-ratio`, `avatar`, `breadcrumb`,
`carousel`, `chart`, `collapsible`, `context-menu`, `drawer`, `form`,
`hover-card`, `input-otp`, `menubar`, `navigation-menu`, `pagination`,
`radio-group`, `resizable`, `slider`, `toggle-group`, `toggle`, `use-toast`.

Note `chart.tsx` is unused even though the dashboard is full of charts — the
pages use Recharts directly, not shadcn's wrapper. And `form.tsx` is unused
while `react-hook-form`, `@hookform/resolvers` and `zod` all remain live
dependencies, imported by reachable code elsewhere; deleting `form.tsx` does
**not** let those three go.

**The 16 dependencies that only these components import** (3.7 MB installed):
`@radix-ui/react-accordion`, `-aspect-ratio`, `-avatar`, `-collapsible`,
`-context-menu`, `-hover-card`, `-menubar`, `-navigation-menu`, `-radio-group`,
`-slider`, `-toggle`, `-toggle-group`, plus `embla-carousel-react`,
`input-otp`, `react-resizable-panels`, `vaul`.

### Edge: 12 unreachable modules in `chat-with-data`, 49,250 bytes — **ALL DELETED 2026-07-31**

Not reachable from any of the 18 function entry points, and **deployed on every
release** — `scripts/deploy-chat-with-data.sh` copies the whole directory and
strips only `*-old.ts` and `*.test.ts`.

| Module | Bytes | Only referenced by |
|---|---|---|
| `data-validation-service.ts` | 8,143 | — |
| `score-normalization-utils.ts` | 7,190 | `data-validation-service.ts` (itself dead) |
| `uncertainty-manager.ts` | 6,996 | — |
| `website-query-analyzer.ts` | 6,097 | — |
| `review-analysis-utils.ts` | 4,111 | — |
| `conversation-memory-manager.ts` | 3,980 | `human-consultant-personality.ts` (itself dead) |
| `data-stats-logger.ts` | 3,515 | — |
| `data-analysis-utils.ts` | 2,559 | — |
| `context-data-stats-builder.ts` | 2,144 | — |
| `response-formatter.ts` | 2,055 | `human-consultant-personality.ts` (itself dead) |
| `human-consultant-personality.ts` | 1,280 | — |
| `error-handler.ts` | 1,180 | — |

Four of them form a dead cluster that references itself, which is why a plain
"is this file mentioned anywhere?" grep would have kept them.

**A trap worth fixing regardless of the cleanup decision:** `error-handler.ts`
is dead while `enhanced-error-handler.ts` is the live one imported by
`index.ts`. A grep for `error-handler` matches both. I nearly recorded the dead
one as live for exactly that reason. Two files whose names are substrings of
each other, one live and one dead, in the same directory, is a foot-gun for
whoever edits next.

Also relevant to the review-metrics work: `score-normalization-utils.ts` and
`review-analysis-utils.ts` are 11 KB of dead code about review scores, sitting
next to the live definitions that
`tests/unit/definition-divergence.test.ts` now pins. If anyone goes looking for
"how are review scores handled", these are the first files they will find, and
they are not the answer.

### What this sweep did NOT cover

File-level reachability only. Unused **exports inside reachable files** were not
swept, so "0 dead code" would be an overstatement of what was checked. Unused
database tables and columns were also out of scope — except where they came up
in audit point 1 (`reviews_backup_20260731`) and the reviews runbook.

---

## Suggested order, if you want it done

1. The four zero-reference deletions (`lovable-uploads/`, `placeholder.svg`,
   `next-themes`, `ui/use-toast.ts`) — no judgement calls in any of them.
2. The 12 dead `chat-with-data` modules. Biggest single win: 49 KB out of every
   deploy and out of the next audit's surface, and it removes the
   `error-handler` naming trap.
3. The 3 dead non-UI frontend files.
4. The 21 components and 16 dependencies, as one commit, once you have decided
   about `lovable-tagger` — both questions are really "is Lovable retired for
   this project?"
