# Two Seasons Insights Dashboard

Operational dashboard for Two Seasons Hotel built with Vite, React, TypeScript, Tailwind, shadcn/ui, and Supabase.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- A Supabase project with the required tables, auth configuration, and edge functions

## Environment Variables

Copy `.env.example` to `.env` and replace the placeholder values.

- `VITE_SUPABASE_PROJECT_ID`
  Supabase project reference used by the frontend.
- `VITE_SUPABASE_PUBLISHABLE_KEY`
  Public anon/publishable key used for browser auth and data access.
- `VITE_SUPABASE_URL`
  Base HTTPS URL for the Supabase project.
- `VITE_WA_DEFAULT_NUMBER`
  Default WhatsApp sender number shown in the dashboard when no user-selected number is stored.

## Local Setup

```sh
npm install
cp .env.example .env
```

Fill in `.env`, then start the app:

```sh
npm run dev
```

## Available Scripts

```sh
npm run dev
npm run build
npm run lint
npm run preview
```

## Security Notes

The Content Security Policy is delivered as an HTTP header on **both** sites, plus
a `<meta>` mirror in the page. The two in-repo copies are pinned to each other by
`tests/unit/csp-header-meta-agree.test.ts`; the third is not — see backlog B24.

- **On testing** the header comes from `public/serve.json` (nginx proxies to
  `serve`, which emits it for `/index.html` and, via the `--single` rewrite,
  every deep link). The deploy script asserts the served header or fails the
  deploy.
- **On production** it comes from two `add_header` lines in CloudPanel's stored
  per-site vhost template (2026-09-03, closing B12). `serve.json` is inert there
  — production has no `serve` and no PM2, nginx serves `dist/` from disk — so
  nginx must carry the value itself. **That copy is not in git**, so nothing
  compares it to `serve.json`; B24 is the gap. Two traps live in that template:
  an `add_header` inside a `location` drops every header inherited from the
  server block, and `always` on the `/assets/` `Cache-Control` would stamp
  one-year `immutable` onto 404s. Read B12 before editing it.
- **In `index.html`** a `<meta http-equiv>` mirror carries the same policy
  **minus `frame-ancestors`** — browsers ignore that directive in `<meta>`, so
  it lives in the header only. Both sites now enforce header and meta together,
  and the browser applies their intersection.

Core directives:

- `default-src 'self'`
  Restricts all unspecified resource types to the same origin by default.
- `script-src 'self'`
  Local scripts only. `'unsafe-eval'` was removed 2026-09-02: its only real
  consumer was bluebird (via mammoth) in the client-side document-upload path,
  which is dead (no INSERT policy — 2026-09-01 audit W5); the earlier claim
  that Recharts needed it was wrong (no eval in recharts). If that upload path
  is ever revived, `.docx` parsing throws until the directive is re-added —
  see the backlog item covering deletion or revival of that feature.
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
  Allows app styles plus Google Fonts stylesheets.
- `font-src 'self' https://fonts.gstatic.com data:`
  Allows locally bundled fonts, Google-hosted font files, and data URLs when needed.
- `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://login.microsoftonline.com`
  Permits Supabase API/realtime traffic and Microsoft sign-in (identity only —
  no Graph calls originate in the browser). The former `localhost`/`127.0.0.1`
  entries are gone: in dev the page origin *is* localhost, so `'self'` already
  covers the dev server and HMR; production had no business allowing them.
- `img-src 'self' data: blob: https://*.supabase.co https://2s-dashboard.digitlab.ai`
  Allows app images, uploaded blobs, Supabase-hosted assets, and the app's own hosted Open Graph image.
- `worker-src 'self' blob:`
  Supports browser workers. The former `https://cdnjs.cloudflare.com` entry was
  dead weight — pdf.js 5.x 404s on that worker URL (audit W9).
- `object-src 'none'`
  Disables legacy plugin/object embedding.
- `base-uri 'self'`
  Prevents hostile `<base>` tag injection from changing relative URL resolution.
- `form-action 'self'`
  Restricts form submission targets; all app forms are JS-handled same-origin.
- `frame-ancestors 'none'` *(HTTP header only)*
  Prevents this app from being embedded in other sites.

## Quality Checks

Recommended checks before release:

- `npm run lint`
- `npm run build`
- verify auth lockout and reset flows manually
- verify dashboard layouts at `375px`, `390px`, `768px`, and `1024px`
- verify WebSocket cleanup and React Query cache behavior in browser DevTools
