# Working in this repo

Conventions and hard-won constraints. Everything here was established by
something going wrong, or by an explicit decision — nothing is aspirational.

## Read first

- **[docs/testing-lessons.md](docs/testing-lessons.md)** — failures this
  codebase has actually had, and what caught them. In every case the symptom was
  something reporting green. Read it before writing a test you intend to trust.
- **[docs/backlog.md](docs/backlog.md)** — named, queued work. Not a wish list;
  each item states what is wrong, why it matters, and what "done" means.

## Gates

```
npm run typecheck      # tsc -p tsconfig.app.json && tsc -p tsconfig.node.json
npm run lint
npm run test:unit      # node --test, tests/unit/ AND supabase/functions/**/*.test.ts
npm run build          # runs typecheck first — WRITES TO dist/, WHICH IS LIVE
npx playwright test    # ~8 min, 105 passing / 37 skipped placeholders
PW_BUILD=1 npx playwright test   # the same tests against a production build
```

**`npm run build` with no `--outDir` is a deploy.** It writes to `dist/`, which is
the directory PM2's `serve` reads, so a build run to inspect chunk sizes puts that
bundle live. Use `--outDir dist-test`, or `scripts/deploy-frontend.sh`, which
builds from a git archive in a temp directory.

**The default suite runs against `npm run dev`, which does not bundle.** No test in
it can fail for a bundling reason: `manualChunks` output, chunk init order,
`public/serve.json` and the SPA rewrite are all invisible to it. `PW_BUILD=1`
builds to `dist-test/` and serves it with the same `serve` command line PM2 uses.
Required after any change to `vite.config.ts` or `public/serve.json`. See
`docs/testing-lessons.md` §10 for the failure that established this.

**`tsc --noEmit` at the repo root checks NOTHING** — the root `tsconfig.json` has
`files: []` plus `references`, so it loads no files and exits 0 regardless. Only
the two per-project invocations above are real. This reported green for weeks.

**Nothing type-checks `supabase/functions`.** Both tsconfigs exclude it (Deno
`.ts` specifiers and `jsr:`/`npm:` imports do not resolve under plain `tsc`), and
the Supabase platform bundles without checking types. `deno` is not installed
here. To check it, see `docs/backlog.md` B2 for the exact command — and expect
pre-existing errors in functions other than `training-report`.

## Deploys

Edge functions deploy from **git, not the working tree**, via self-verifying
scripts that refuse to report success unless the platform version actually
bumped:

```
SUPABASE_ACCESS_TOKEN=<token> bash scripts/deploy-chat-with-data.sh
SUPABASE_ACCESS_TOKEN=<token> bash scripts/deploy-training-report.sh
SUPABASE_ACCESS_TOKEN=<token> bash scripts/deploy-sp-submit-training.sh
SUPABASE_ACCESS_TOKEN=<token> bash scripts/deploy-sp-function.sh <fn>|--all
```

`deploy-sp-function.sh` covers `sp-read-colleagues`, `sp-read-columns`,
`sp-read-trainers` and `sp-manage-colleague` — one script, because these four are
identical to deploy and four copies would drift. It refuses a name outside that
list rather than creating a new function on the platform.

The token stays in the operator's own shell. The MCP `deploy_edge_function` tool
requires every file's contents inline, which for a multi-file function means
hand-reproducing tens of KB — use the scripts.

The **frontend** deploys the same way, `bash scripts/deploy-frontend.sh`. nginx
does not serve the files: it proxies to `serve dist -l 3007 -s` running under PM2
as `testing-2s-dashboard`. Consequences worth knowing before deploying by hand:

- Cache headers come from `public/serve.json`, which Vite copies into `dist/`, and
  **`serve` reads it once at startup**. Swapping `dist` without
  `pm2 restart testing-2s-dashboard` changes the files and silently keeps the old
  cache policy, while looking like a complete success.
- `serve` validates `serve.json` against `@zeit/schemas` with
  `additionalProperties: false` and **refuses to start** if it fails — an invalid
  config takes the site down at the next restart rather than degrading caching.
  `tests/unit/serve-config-valid.test.ts` fails the build on that.
- The script verifies against the public URL after restarting and exits non-zero
  unless the freshly built asset is actually being served with the declared
  headers.

Several edge modes are gated on a real **admin user JWT** (`getCallerUser` then
`has_role`). A service-role key has no user and fails the first check, so these
cannot be driven without the operator's session:
`scripts/send-training-report-test.sh`, `scripts/send-training-report-real.sh`,
`scripts/sera-battery.sh`. Verify everything except authorization by running them
with a deliberately invalid JWT — the gateway returns 401 before the function
runs, which exercises URL, body, headers and error handling while making a real
send impossible.

## Database

- PostgREST clamps every response to `api.max_rows = 1000`. A literal
  `.limit(N > 1000)` silently returns 1000 rows and any total derived from
  `rows.length` is wrong. This shipped twice. Use `fetchAllRows` (frontend) or
  `fetchAllWithCap` (edge); `tests/unit/no-overclamp-limit.test.ts` fails the
  build on a regression.
- **`CREATE TABLE AS` does not inherit RLS.** Every ad-hoc snapshot table starts
  world-readable *and world-writable* through the published anon key, because the
  `anon` role holds Supabase's default blanket grants. Check
  `has_table_privilege('anon', ..., 'INSERT')`, not just `relrowsecurity`.
- Migrations are applied via MCP `apply_migration`, and every one gets a
  `*_rollback.sql` sibling that states what rolling back costs.
- Verify a schema change by its **behaviour**, not the catalogue: insert the rows
  the constraint should allow and the ones it should refuse, then delete the
  probes and re-verify. `relrowsecurity = true` is a setting; a refused INSERT is
  proof.

## Scheduling

All calendar logic is **Asia/Dubai, fixed +04:00, no DST**. Day-of-week and
day-of-month must be computed from the Dubai calendar date, never from the UTC
instant — they diverge in the 20:00–23:59 UTC window. `report-schedule.ts` uses
`Date.UTC(...)` purely as a calendar calculator for this reason.

## Auth

- The **Azure Tenant URL** must be the tenant *GUID*, never the tenant domain:
  `https://login.microsoftonline.com/2e9f09ed-8e4e-48d6-b37e-77b4bd4941a4`.
  Microsoft always issues ID tokens with the GUID in `iss`, and GoTrue validates
  `iss` against this setting *before* looking up any user — so the domain form
  breaks Microsoft sign-in for **every** account at once, with a
  `500: Error getting user profile from external provider` on `/callback` and
  nothing in the app to suggest a config problem. The domain form restricts
  nothing that the GUID form does not; it is simply wrong.
- Three accounts (`info@`, `teleopr@`, `2srewards@`) have an `azure` identity and
  **no password**. Anything that breaks OAuth locks them out completely — they
  have no fallback. Check them explicitly before and after any auth change.
- Signup is disabled, and that is deliberate. It does **not** block linking a new
  provider to an existing user: same-email automatic linking does not create a
  user, so it never consults `disable_signup`.
- None of this is in version control. See `docs/backlog.md` B3.

## Commits

One task per commit, on `main`. Commit messages carry the evidence: what was
verified, how, and what is still unproven. Every commit ends with:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

## Do not touch

- `src/pages/dashboard/WhatsApp.tsx`, `src/pages/dashboard/Email.tsx`,
  `src/pages/WhatsAppLanding.tsx` — must stay byte-identical.
- **n8n.** Workflows are edited by hand in the UI by the operator. Read-only
  inspection of exported workflow JSON is fine; changing anything is not.
- Never send an email without an explicit instruction for that specific send.
