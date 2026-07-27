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

The app uses a document-level Content Security Policy in `index.html` with these core directives:

- `default-src 'self'`
  Restricts all unspecified resource types to the same origin by default.
- `script-src 'self' 'unsafe-eval'`
  Allows local scripts and the current Vite/Recharts toolchain behavior. `unsafe-eval` is retained for current build/runtime compatibility and should be revisited if dependencies change.
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
  Allows app styles plus Google Fonts stylesheets.
- `font-src 'self' https://fonts.gstatic.com data:`
  Allows locally bundled fonts, Google-hosted font files, and data URLs when needed.
- `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://login.microsoftonline.com http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*`
  Permits Supabase API/realtime traffic, Microsoft sign-in (identity only — no Graph calls originate in the browser), and local development servers.
- `img-src 'self' data: blob: https://*.supabase.co https://2s-dashboard.digitlab.ai`
  Allows app images, uploaded blobs, Supabase-hosted assets, and the app's own hosted Open Graph image.
- `worker-src 'self' blob: https://cdnjs.cloudflare.com`
  Supports browser workers used by document-processing dependencies.
- `frame-ancestors 'none'`
  Prevents this app from being embedded in other sites.
- `object-src 'none'`
  Disables legacy plugin/object embedding.
- `base-uri 'self'`
  Prevents hostile `<base>` tag injection from changing relative URL resolution.

## Quality Checks

Recommended checks before release:

- `npm run lint`
- `npm run build`
- verify auth lockout and reset flows manually
- verify dashboard layouts at `375px`, `390px`, `768px`, and `1024px`
- verify WebSocket cleanup and React Query cache behavior in browser DevTools
