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

**Only `whatsapp-control-status` is public (`verify_jwt = false`) by contract** — two live n8n
workflows call it header-less (backlog B17). Every other function requires a signed JWT, and
the dashboard-facing ones resolve it to a real user and check `is_hotel_staff` in the body;
the scrapers and `whatsapp-auto-release` accept only a `service_role` claim. The old
`supabase/config.toml` comment that the public functions "carry their own in-body auth" was
false (2026-09-01 audit, E1/E2/E5/E12) and is corrected there.

`deploy-sp-function.sh` covers `sp-read-colleagues`, `sp-read-columns`,
and `sp-manage-colleague` — one script,
because these are identical to deploy and five copies would drift. It refuses a name
outside that list rather than creating a new function on the platform.

The token stays in the operator's own shell — and **never on the command line**:
`SUPABASE_ACCESS_TOKEN=<token> bash …` lands the token in `~/.bash_history` and in
`/proc/*/cmdline` for the life of the `curl` (found 5× in root's history on 2026-09-01; that
token was rotated). Use `read -rs SUPABASE_ACCESS_TOKEN; export SUPABASE_ACCESS_TOKEN`, the
way `scripts/send-training-report-*.sh` already take a JWT. The MCP `deploy_edge_function`
tool requires every file's contents inline, which for a multi-file function means
hand-reproducing tens of KB — use the scripts for anything that imports `_shared/`.
Single-file functions (and functions with same-directory siblings such as `guards.ts`,
`csv.ts`, `jwt-role.ts`) are deployed through MCP with `verify_jwt` stated explicitly; a
function that needs `roleFromAuthorization` carries a byte-identical sibling copy of
`_shared/jwt-role.ts`, pinned by `tests/unit/jwt-role-copies-agree.test.ts`.

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
- **It overlays `dist`, it does not replace it.** The app is code-split, so a page
  that was already open imports lazy chunks by hashed filename; replacing `dist`
  deleted them and gave anyone mid-session a dead panel — "Failed to fetch
  dynamically imported module" — the first time they opened a route they had not
  visited. The live tree is therefore (previous tree) ∪ (new build). `dist/assets`
  legitimately holds files from several builds; that is not stale garbage, and
  `RETAIN_DAYS` (default 7) is what eventually removes them. Retention is safe only
  because those names are content hashes.
- Running the script is a deploy, so its logic is exercised by
  `bash scripts/rehearse-deploy-frontend.sh [mutation]` — the real script against a
  sandbox with `npm`/`pm2`/`curl` shimmed, refusing to run unless it has verifiably
  replaced the constants pointing at the live site.
  `tests/unit/deploy-frontend-overlay.test.ts` runs it five ways in `npm run
  test:unit`, three of them mutations proving the deploy's own checks can fail.

### Production is a different machine shape, and `deploy-frontend.sh` does NOT apply

`2s-dashboard.digitlab.ai` lives in a separate checkout
(`/home/digitlab-2s-dashboard/htdocs/2s-dashboard.digitlab.ai`) with its own git remotes,
and **nginx serves its `dist/` straight from disk** — no PM2, no `serve`, so `serve.json` is
inert there. `deploy-frontend.sh` is hardcoded to testing (`REPO`, `PUBLIC_URL`, `PM2_APP`);
running it from the production checkout deploys the *wrong site*. Deploy production by hand:
`npx vite build --outDir dist-new --emptyOutDir` (never bare `npm run build`), overlay
`dist-new` onto `dist` excluding `index.html`, then swap `index.html` by atomic rename.
Promotions use `git read-tree -u --reset testing/main` — the histories are unrelated — and
`supabase/functions/process-document` must be hand-restored afterwards.

Since 2026-09-03 production's **response headers come from CloudPanel's stored vhost
template**, not from `serve.json`: the CSP and the `no-cache`/`immutable` `Cache-Control`
pair are `add_header` lines in that template (B12, closed). Two things about it bite
silently. An `add_header` anywhere inside a `location` **drops every header inherited from
the server block**, so each location re-`include`s `/etc/nginx/global_settings` instead of
copying it. And `always` must **never** appear on the `/assets/` `Cache-Control`: that
block's `try_files $uri =404` produces 404s, and `always` would cache a missing chunk as
`immutable` for a year in the user's browser, which no server-side rollback can undo.
Copies of the before and after templates are in `/root/backups/vhost/`; the template is not
in git, so nothing compares its CSP to `serve.json` (B24).

**PRODUCTION WHITE-SCREENED AFTER AN SSL RENEWAL? Recover with this.** CloudPanel
regenerates the vhost during `lets-encrypt:install:certificate`. On 2026-08-04 that reverted
`root` from `dist` to the site root and served the Vite *source* `index.html` for `/` and
every `/assets/*` for 37 minutes. **Fixed the same day** by putting a location-level
`root .../dist;` into the site's per-site vhost template via CloudPanel's Vhost tab, and
**proven** by re-running the renewal: the vhost was regenerated byte-identically and a new
certificate issued. Keep the command below anyway — it is the fallback if that template edit
is ever lost, and the failure is silent until someone loads the page. The two-space indent
anchors the server-level `root`; the acme-challenge block's `root` is indented four and
**must not change**:

```
sed -i 's#^  root /home/digitlab-2s-dashboard/htdocs/2s-dashboard.digitlab.ai;#  root /home/digitlab-2s-dashboard/htdocs/2s-dashboard.digitlab.ai/dist;#' \
  /etc/nginx/sites-enabled/2s-dashboard.digitlab.ai.conf
nginx -t && systemctl reload nginx
curl -s https://2s-dashboard.digitlab.ai/ | grep -q '/assets/index-' && echo OK || echo STILL BROKEN
```

See `docs/backlog.md` B11 for the permanent fix and `docs/testing-lessons.md` §14.

Several edge modes are gated on a real **admin user JWT** (`getCallerUser` then
`has_role`). A service-role key has no user and fails the first check, so these
cannot be driven without the operator's session:
`scripts/send-training-report-test.sh`, `scripts/send-training-report-real.sh`,
`scripts/sera-battery.sh`. Verify everything except authorization by running them
with a deliberately invalid JWT — the gateway returns 401 before the function
runs, which exercises URL, body, headers and error handling while making a real
send impossible.

## Colleague text

**Every writer to Colleagues_Master must collapse whitespace before writing** —
`collapseColleagueFields` from `supabase/functions/_shared/text.ts` (edge) or
`src/lib/text.ts` (frontend), on all four text fields, not just the name.

This is here because the test cannot enforce it.
`tests/unit/colleague-fields-agree.test.ts` pins the two *existing* declarations to
each other; nothing stops a new writer — a bulk import, a fix-up script — from
writing raw values and reopening the hole.

What the hole costs: the monthly report dedupes trainer names with
`raw.trim().toLowerCase()`, so `"A  B"` and `"A B"` count as two different trainers,
and Sera matches participants with `.includes(needle)`, so a stored double space
cannot be found by a needle typed with one. Six of 336 rows were dirty on
2026-08-04 — five names and two positions — five colleagues were silently
unfindable, and the source was `sp-manage-colleague` validating with `.trim()` and
writing the raw value one line later. See `docs/testing-lessons.md` §13 and
`docs/backlog.md` B8, which still owes the participant-write backstop and the
migration for rows already written.

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
- The Graph app registration holds **Graph** application permissions only, and **nothing
  in this codebase needs more.** The pending SharePoint application permission
  (`Sites.Manage.All` for `_api/web/ensureuser`) was a dependency of the Person-column
  write, which no longer exists — **do not request that consent for this app.** The
  finding is preserved in full in
  `docs/superpowers/specs/2026-08-03-trainer-field-is-the-participant-picker-design.md`
  because it is the reason nobody should revive `ensureuser`, not because it is still
  needed.
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
