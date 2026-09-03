# Rollback notes — 2026-09-01 hardening

Companion to [ROLLBACK.sql](ROLLBACK.sql). That file reverses every **database** change in
[HANDOFF-2026-09-01.md](HANDOFF-2026-09-01.md) in one transaction. This file covers what SQL
cannot reverse, the order the SQL depends on, and what the drift check against today's live
schema dump found.

Nothing here has been executed. Both files are authored from the repo (forward migrations as
the record of what was done, earlier migrations as the record of what it was) and from
`/root/backups/pre-deploy-schema.sql`, a `pg_dump --schema-only` taken 2026-09-01 17:43 (+04),
after every change in the handoff had been applied.

## 1. What ROLLBACK.sql does and does not do

| Handoff row | Reversed by | Pre-change source |
|---|---|---|
| RLS + grants on `qms_request_log`, `integrity_check_history`, `n8n_chat_histories_backup_serafix_20260824` (`d453f57`) | Phase 1 block | **Not in the repo** — restored to the default-privilege template recorded in the dump; see the comment in the file |
| anon EXECUTE on `has_role`, `is_hotel_staff` (`667cea4`) | Phase 1 block | Implicit PUBLIC + default privileges (`20260423144901` created them with no explicit grant); PUBLIC and anon both restored |
| anon EXECUTE on `is_conversation_human_controlled` (`b7d6634`, applied under `667cea4`) | Phase 1 block | `20260515151238` lines 25–26 |
| `rls-sentinel-daily` (`1a23769`) | Phase 2 block | Not scheduled before 2026-09-01 (function existed since 2026-08-20) |
| `Hotel staff can update Chat History` + freeze function body (`7b90b95`) | Phase 2 block | `20260423144901` lines 115–122; `20260731200000` lines 86–111 |
| `sharepoint_mirror` / `2s-dashboard_AI_Chat` policies (`c70e49f`, two migrations) | Phase 3 block | `20260802230000` lines 66–70; `20260423145305` lines 61–64 |

Where this file's SQL differs from the `*_rollback.sql` siblings committed alongside each migration:

- **`20260901100000` sibling uses `GRANT ALL`** — that would give `anon` TRUNCATE, which these
  tables never had (all three were created after the platform migration
  `revoke_anon_truncate_default_privileges`, 2026-08-20) and which the sentinel function reports
  as `anon_truncate_detected`. ROLLBACK.sql grants the exact default-privilege list instead.
- **`20260901100100` and `20260831120100` siblings restore `anon` only.** The forward migrations
  revoked `PUBLIC` *and* `anon`; ROLLBACK.sql restores both, which is the faithful inverse.
- Everything else is statement-for-statement identical in effect; ROLLBACK.sql additionally
  wraps `cron.unschedule` in an existence check (the bare call raises when the job is absent)
  and ends with a verification block that aborts the transaction if any pre-change state is not
  actually back.

Deliberately **not** touched, per the plan's constraints N1–N7: no statement grants to, revokes
from, or names the two non-anon platform roles (the explicit grants `667cea4` added to them are
left in place — redundant once PUBLIC is restored, and the `authenticated` one is load-bearing
for every staff policy); no `cron.job` row other than `rls-sentinel-daily` is read or written;
the `"Chat History"` BEFORE INSERT trigger and its function are untouched; the sentinel function,
its `rls_sentinel_*` tables and their grants (2026-08-20, not in the handoff) are untouched;
sequence grants on the three lockdown tables were never changed and are not changed.

## 2. Ordering dependencies between statements

ROLLBACK.sql is one transaction, so the order inside it only matters if the file is split or
run piecemeal. If it is split, these must hold:

1. **`cron.unschedule('rls-sentinel-daily')` before the three `DISABLE ROW LEVEL SECURITY`
   statements.** The sentinel's 03:30 (+04) daily run enables RLS on every `postgres`-owned
   public table that has it off. It never touches grants, so after a run the restored `anon`
   / `authenticated` grants would remain but return nothing — the rollback would silently
   un-do itself on the read path. Alternative if the job must stay: insert the three table
   names into `public.rls_sentinel_allowlist` first (not done by ROLLBACK.sql; that table is
   outside the handoff).
2. **`20260901100401`'s reversal before `20260901100400`'s** (the order in the file). Run the
   other way round, `"2s-dashboard_AI_Chat"` ends up with *both* `Hotel staff can read
   website_chats` and the intermediate `users read their own sera chats; admins read all` —
   two permissive policies OR-ed together, wider than any state the table has ever had.
   Within the correct order the intermediate policy exists only between the two blocks.
3. **The two policy recreations that call `public.is_hotel_staff(auth.uid())`** (`Chat History`
   UPDATE, `website_chats` SELECT) do not depend on the Phase 1 grant restoration:
   `authenticated` never lost EXECUTE on that function. They can run in any order relative
   to Phase 1.
4. **The whole file must run as `postgres`.** `cron.unschedule` succeeds only for the job's
   owner or a superuser; under any other role it raises, which aborts the transaction and
   leaves everything as it is now. That is the intended fail-closed behaviour — do not work
   around it by removing `BEGIN`/`COMMIT`.
5. The verification block at the end is part of the transaction on purpose: if it raises,
   nothing has been rolled back. Read its message; it names the phase that is incomplete.

## 3. Changes NOT reversible by SQL alone

### 3.1 Edge functions redeployed 2026-09-01 via MCP `deploy_edge_function`

Versions confirmed against `list_edge_functions` on 2026-09-01 ~18:00 (+04); every `updated_at`
below is the platform's, converted to Asia/Dubai.

| Function | Live version | Deployed at | Commit | `verify_jwt` before → after | Files in the deploy | Previous git revision of `index.ts` |
|---|---|---|---|---|---|---|
| `whatsapp-web-chat` | 86 | 13:53 | `b7c8e61` | **false → true** | `index.ts`, `guards.ts` (new) | `42ac596` |
| `execute-n8n-action` | 206 | 13:54 | `1e8c434` | **false → true** | `index.ts` | `ace2e0a` |
| `whatsapp-auto-release` | 25 | 13:55 | `25e374a` | **false → true** | `index.ts`, `jwt-role.ts` (new) | `946fe01` |
| `whatsapp-send-message` | 89 | 13:56 | `777f5fb` (source `efe02cf`, committed 2026-08-31) | true → true | `index.ts` | `6aeacda` |
| `firecrawl-scrape` | 43 | 14:09 | `4635e47` | true → true | `index.ts`, `jwt-role.ts` (new) | `57705cb` |
| `browserless-scrape` | 43 | 14:10 | `4635e47` | true → true | `index.ts`, `jwt-role.ts` (new) | `6eb1042` |
| `serpapi-hotels` | 25 | 14:11 | `4635e47` | true → true | `index.ts`, `jwt-role.ts` (new) | `57705cb` |
| `export-booking-inquiries` | 14 | 14:12 | `d124023` | true → true | `index.ts`, `csv.ts` (new) | `2d92b39` |
| `sheraton-marriott-browser` | 16 | 14:13 | `4635e47` | true → true | `index.ts`, `jwt-role.ts` (new) | `5eb1dc2` |

"Previous git revision" is the last commit that touched that function's `index.ts` before the
deploying commit. `4635e47` recorded that each scraper's HEAD file was diffed against the running
code via the management API before deploying and was byte-identical, so for those four the
previous git revision *is* the previously running code. For the other five that equivalence was
not recorded; the platform keeps no retrievable source for superseded versions, so the previous
git revision is the only recoverable source.

Manual steps, per function:

1. `git show <previous revision>:supabase/functions/<slug>/index.ts > /path/index.ts`. Deploy
   **only** the files that existed at that revision — the sibling `guards.ts` / `jwt-role.ts` /
   `csv.ts` did not, and must not be included.
2. Deploy with MCP `deploy_edge_function`, stating `verify_jwt` **explicitly** as the "before"
   value in the table. Omitting it does not preserve the current value reliably.
3. Confirm with `list_edge_functions` that the version incremented (the plan's N7 standard:
   a redeploy is proven by the version bump *and* a live request).
4. For the three functions whose `verify_jwt` returns to `false`, the live check is the
   inverse of today's: a header-less request must now be **accepted**. Understand what that
   restores before doing it — audit findings E1 (unauthenticated inserts under any number and
   read of a guest's history through the AI reply), E2 (open HMAC-signing relay), E12 (anyone
   can trigger the sweep). This is a rollback of a security fix, not a neutral revert.
5. Revert the matching entries in `supabase/config.toml` (the diff `origin/main..HEAD` on that
   file is exactly: `whatsapp-web-chat` `false → true`, new `[functions.execute-n8n-action]`
   and `[functions.whatsapp-auto-release]` sections set to `true`, and the corrected comment).
   The file is not consulted by MCP deploys; it is the record the next `supabase functions
   deploy` would apply.

The `_shared/jwt-role.ts` sibling-copy convention is pinned by
`tests/unit/jwt-role-copies-agree.test.ts`; if the sibling files are deleted from the repo as
part of a rollback, that test and its list must change with them.

### 3.2 Committed but never deployed — nothing on the platform to roll back

`chat-with-data` is still v293 (2026-08-01 19:05 +04); `sp-read-colleagues` v18, `sp-read-columns`
v11, `sp-submit-training` v19, `sp-manage-colleague` v10 and `training-report` v12 are unchanged
since August. The `requireStaff`/`requireAdmin` gates (`3dacf52`), the Sera fixes (`fa9b11f`) and
the Graph Retry-After cap (`6a963ba`) exist only in git. Rolling them back is a git operation on
the commits; the platform needs nothing.

### 3.3 Frontend deployed to testing

`dist/index.html` and `dist/assets/*` on this host were written at **14:58 (+04)** today, thirteen
minutes after HEAD (`0cd178d`, 14:45). The live testing site serves `/assets/index-BAyCVqhx.js`,
the same hash as `dist/index.html` (checked by GET on 2026-09-01). **No commit records this
deploy** (the plan's T22 gate says `deploy-frontend.sh` prints `DEPLOY OK`; nothing in
`git log` quotes it), and `dist/` is git-ignored, so which commit was built is not recorded —
by timing it is `0cd178d` or `1867933`.

Manual rollback: `DEPLOY_REF=<previous commit> bash scripts/deploy-frontend.sh` (the script
builds from `git archive` of `DEPLOY_REF`, default `HEAD`, from a temp directory; it overlays
`dist` rather than replacing it, so sessions already open keep their lazy chunks; it restarts
PM2 `testing-2s-dashboard` itself, which is required for `serve.json` to be re-read). Verify
with the script's own post-deploy check (it exits non-zero unless the public URL serves the
fresh asset with the declared headers). Production (`2s-dashboard.digitlab.ai`) is a separate
checkout that was **not** promoted today and needs nothing.

### 3.4 Cron job ownership

`rls-sentinel-daily` was scheduled by a migration run as `postgres`, so `cron.job.username` is
`postgres`. `cron.unschedule` must be executed by that owner (or a superuser, which the
project's `postgres` is not) — the Supabase SQL editor and MCP `execute_sql` both run as
`postgres`, so ROLLBACK.sql works from either. It fails from any other connection; that is
covered in §2.4. No job is re-owned, altered, or listed other than by this exact name (N4).

### 3.5 Data written by today's changes (left in place)

- `public.rls_sentinel_log` / `rls_sentinel_state` rows from the sentinel's first scheduled
  run (`1a23769`: "first run changed 0 tables"). Log rows; harmless; not reversed.
- The seven rows in `supabase_migrations.schema_migrations` for today's migrations
  (`lockdown_rls_off_tables`, `revoke_anon_control_status`, `revoke_anon_role_oracles`,
  `schedule_rls_sentinel`, `chat_history_update_policy_and_freeze`,
  `scope_mirror_and_sera_chat_policies`, `sera_chat_policy_requires_staff`). ROLLBACK.sql does
  not delete them: the platform will then consider the migrations applied and will not re-apply
  them, which is the safe state for a rolled-back database. If the repo's migration files are
  also reverted in git, leave these rows alone.

## 4. What the drift check found (Phase D)

Method: every `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, `CREATE TRIGGER` and `REVOKE` in the
dump was cross-referenced against the handoff and against every file in `supabase/migrations/`;
the platform's own migration history (`list_migrations`) was then used to attribute what the repo
could not.

**The handoff and the dump agree on every object the handoff names.**

- The three tables have `ENABLE ROW LEVEL SECURITY` and grants to only the platform's
  non-anon roles (sequence grants to `anon`/`authenticated` remain — the migration never
  touched sequences, and the handoff does not claim it did).
- The three functions have `REVOKE ALL … FROM PUBLIC` with `authenticated` retained.
- All four dropped policies are absent; both surviving created policies are present with the
  definitions the handoff gives; the intermediate `users read their own sera chats; admins read
  all` is absent, as the handoff says.
- `chat_history_freeze_handled_by()` in the dump is the 2026-09-01 body (the
  `elsif … is distinct from …` branch); both `"Chat History"` trigger definitions are unchanged.
- **The cron job cannot be checked from this dump.** `pg_dump --schema-only` does not emit
  `cron.job` rows (extension data), and the dump contains no `cron.` reference at all. Its
  presence rests on `1a23769`'s recorded check (`cron.job` shows the job as `postgres`, active)
  and the migration's own post-apply assertion, not on the dump.

**Objects in the dump that are in neither the handoff nor any repo migration — none from today.**

| Kind | Objects | Attribution |
|---|---|---|
| Policies (4) | `Hotel staff can read/insert/update/delete competitor rates` ×3 on `competitor_hotel_rates`; `Hotel staff can read 2Seasons_Sera_Email_Log` | Platform migrations `rls_competitor_hotel_rates_confidential` (2026-06-02), `add_rls_policy_sera_email_log` (2026-05-21) |
| Function REVOKEs (3) | `enforce_rls_on_public_tables()`, `rls_sentinel_check_last_push()`, `rls_sentinel_notify()` | Platform migration `rls_sentinel_guard` (2026-08-20) |
| Triggers (4) | `trg_sera_email_log_updated_at`, `trg_skip_empty_burst_messaging_rows`, `trg_skip_reaction_rows`, `trg_two_seasons_competitor_rates_insert_as_upsert` | Sera-email and competitor-rates platform migrations; `skip_reaction_rows` / `…insert_as_upsert` are *mentioned* in April repo migrations but the triggers are created elsewhere |
| RLS-enabled tables (19) | `private.integration_secret_status`; `2Seasons_Sera_Email_Log`; `2s burst_email`; `2s burst_messaging`; `2s-dashboard_AI_Chat`; `2s_email_threads_24Hrs_Deleted`; `Two Seasons and Reviews`; `alembic_version`; `competitor_hotel_rates`; `n8n_chat_histories_backup_20260820`; `prompt_patch_history`; `regression_run_history`; `regression_test_cases`; `rls_sentinel_allowlist`; `rls_sentinel_log`; `rls_sentinel_state`; `sera_email_evaluation_history`; `sera_voice_evaluation_history`; `workflow_state` | None of these tables is *created* by a repo migration either. They belong to the 16 platform migrations that have no repo file (listed below) or to tables created outside migrations entirely (`alembic_version`, `workflow_state`, `regression_*`, `prompt_patch_history`, `*_evaluation_history` — other tools sharing this project). `2s-dashboard_AI_Chat` is the renamed `website_chats`; the rename is not in the repo. |

Platform migrations with no repo file (from `list_migrations`, oldest first):
`add_escalation_to_message_direction_check`, `create_email_log_table`, `recreate_sera_email_log`,
`add_rls_policy_sera_email_log`, `create_competitor_hotel_rates`,
`rls_competitor_hotel_rates_confidential`, `create_sera_email_evaluation_history`,
`instagram_token_service_private_metadata`, `protect_n8n_chat_histories_backup_20260820`,
`revoke_anon_truncate_default_privileges`, `rls_sentinel_guard`,
`allow_review_needed_status_competitor_rates`, `add_source_attribution_to_competitor_rates`,
`source_attribution_as_generated_columns`, `add_dedupe_key_to_two_seasons_reviews`,
`create_qms_request_log`. The newest is 2026-08-30; the seven after it are today's, all with repo
files.

So: **no RLS setting, policy, trigger or revoked grant in the dump was applied outside migrations
today.** The pre-existing gap is that sixteen platform migrations (2026-04 to 2026-08-30) were
applied through the platform and never captured as files in this repo — that is a repo-completeness
finding, not a 2026-09-01 drift finding, and it is why the pre-change grants for two of the three
lockdown tables are not recoverable from the repo (§1). `20260901100200`'s header already records
`rls_sentinel_guard` as a "live migration" with no file.

Two observations outside the DB scope, noted because they surfaced during the same check:

- `list_edge_functions` shows two functions with `verify_jwt = false` that are **not in this
  repo** at all: `review-fetcher-ingest` v1 and `khalidiya-reviews-ingest` v1 (created 2026-08-27
  and 2026-08-31 by the platform timestamps). CLAUDE.md and `config.toml` state that only one
  function is public by contract; these two are unaccounted for by that statement.
- The frontend deploy at 14:58 (§3.3) is not recorded in any commit.
