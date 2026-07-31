import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerUser } from '../_shared/auth.ts';
import { haveAzureCreds, getAppToken, graphFetch, GRAPH_BASE, GraphError } from '../_shared/graph.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchAllWithCap } from '../chat-with-data/paged-fetch.ts';
import { dueReports, dubaiToday, lastDayOfMonth, reminderDay, nextDayDubaiMidnightISO } from './report-schedule.ts';
import type { DueReport } from './report-schedule.ts';
import { aggregateReport } from './report-aggregator.ts';
import { renderReportEmail } from './report-html.ts';
import type { OutstandingFailure } from './report-html.ts';

const SENDER = 'sera@2seasonshotels.com';
const RECIPIENTS = [
  'amir.monir@2seasonshotels.com',
  'xarmaigne.narciso@2seasonshotels.com',
  'ahmed.mokhtar@2seasonshotels.com',
];
const SESSION_CAP = 2000;
const PARTICIPANT_CAP = 10000;
// PostgREST builds `.in('training_id', ids)` as a URL query string; with
// thousands of ids that URL can exceed server/proxy length limits. Chunking
// keeps each request's id list small regardless of how many sessions match.
const TRAINING_ID_CHUNK = 200;

function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

// Same JWT-forwarding pattern as _shared/auth.ts, but returns a client (not
// just the user) so 'test' mode can run the has_role RPC as the caller —
// admin-gating must be RLS-true, not just "a session exists".
function callerClient(req: Request) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
}

async function sendMail(token: string, to: string[], subject: string, html: string) {
  await graphFetch(token, `${GRAPH_BASE}/users/${SENDER}/sendMail`, {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchReportData(db: ReturnType<typeof serviceClient>, fromISO: string, toExclusiveISO: string) {
  const sessions = await fetchAllWithCap((from, to, withCount) => {
    const q = db.from('training_sessions')
      .select('training_id, department, duration_minutes, total_participants, sync_status, trainer_names',
        withCount ? { count: 'exact' } : {})
      .gte('training_date', fromISO).lt('training_date', toExclusiveISO)
      .order('training_id', { ascending: true })
      .range(from, to);
    return q;
  }, SESSION_CAP);
  if (sessions.error) throw new Error(`sessions fetch failed: ${JSON.stringify(sessions.error)}`);
  // fetchAllWithCap silently clamps `rows` to the cap; exactCount is the ONLY
  // signal that more rows existed. Ignoring it would send an undercounted
  // report with no indication anything was wrong — this repo has shipped
  // that exact silent-truncation bug twice already (see
  // tests/unit/no-overclamp-limit.test.ts). Fail loudly instead: the caller
  // (runDueReport / handleTest) records this as a 'failed' ledger attempt.
  if (sessions.exactCount !== null && sessions.exactCount > SESSION_CAP) {
    throw new Error(
      `sessions for [${fromISO}, ${toExclusiveISO}) total ${sessions.exactCount}, exceeding SESSION_CAP=${SESSION_CAP} — refusing to send an undercounted report.`,
    );
  }
  const ids = sessions.rows.map((s) => s.training_id);
  const participantRows: { training_id: string; employee_id: string | null }[] = [];
  let participantExactCount = 0;
  for (const idChunk of chunk(ids, TRAINING_ID_CHUNK)) {
    const p = await fetchAllWithCap((from, to, withCount) =>
      db.from('training_participants')
        .select('training_id, employee_id', withCount ? { count: 'exact' } : {})
        .in('training_id', idChunk)
        .order('id', { ascending: true })
        .range(from, to), PARTICIPANT_CAP);
    if (p.error) throw new Error(`participants fetch failed: ${JSON.stringify(p.error)}`);
    participantRows.push(...p.rows);
    participantExactCount += p.exactCount ?? p.rows.length;
  }
  if (participantExactCount > PARTICIPANT_CAP) {
    throw new Error(
      `participants for [${fromISO}, ${toExclusiveISO}) total ${participantExactCount}, exceeding PARTICIPANT_CAP=${PARTICIPANT_CAP} — refusing to send an undercounted report.`,
    );
  }
  const t = await db.from('training_targets').select('department, monthly_target_hours');
  if (t.error) throw new Error(`targets fetch failed: ${JSON.stringify(t.error)}`);
  return { sessions: sessions.rows, participants: participantRows, targets: t.data ?? [] };
}

// --- Period/range resolution for 'test' mode -------------------------------
// dueReports() only ever looks at "now"; the admin test probe needs to
// resolve a period/range the same way even when today isn't a due day (or
// when an explicit period override is given), so this duplicates just the
// midnight-ISO formatting dueReports() keeps private to report-schedule.ts.

const pad = (n: number) => String(n).padStart(2, '0');
const dubaiMidnightISO = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}T00:00:00+04:00`;

// Matches 'YYYY-MM' with a real 01-12 month and a year in 2000-2099; used to
// reject a malformed `period` override before it reaches Number() and turns
// into NaN-NaN. The year is deliberately narrowed from a bare \d{4} (which
// accepted e.g. "0000-01") to 20\d\d: a year like 0000 survives Number()
// fine but produces a nonsensical ISO instant ("0-01-01T00:00:00+04:00")
// downstream, which Postgres then rejects with a 500 instead of the
// intended 400. 20\d\d comfortably covers EARLIEST_PERIOD ('2026-08') and
// every real period for the life of this feature.
const PERIOD_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;
export function isValidPeriod(period: string): boolean {
  return PERIOD_RE.test(period);
}

function monthLabel(year: number, month1: number): string {
  return new Date(Date.UTC(year, month1 - 1, 1))
    .toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

interface ResolvedTestReport {
  reportType: 'monthly_summary' | 'reminder';
  period: string;
  periodLabel: string;
  rangeFromISO: string;
  rangeToExclusiveISO: string;
  dueDate: string;
  daysLeftInMonth?: number;
}

function resolveTestReport(
  report: 'monthly' | 'reminder',
  periodParam: string | undefined,
  nowUtcMs: number,
): ResolvedTestReport {
  const { ymd: today } = dubaiToday(nowUtcMs);
  const [ty, tm, td] = today.split('-').map(Number);

  if (report === 'monthly') {
    const [y, m] = periodParam
      ? periodParam.split('-').map(Number)
      : (tm === 1 ? [ty - 1, 12] : [ty, tm - 1]);
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    return {
      reportType: 'monthly_summary',
      period: `${y}-${pad(m)}`,
      periodLabel: monthLabel(y, m),
      rangeFromISO: dubaiMidnightISO(y, m, 1),
      rangeToExclusiveISO: dubaiMidnightISO(nextY, nextM, 1),
      // The month-M-1 report is due on the 1st of month M (next month), not
      // the 1st of its own period month — this only ever renders in the
      // delayed banner, which test mode never sets, so it was latent.
      dueDate: `${nextY}-${pad(nextM)}-01`,
    };
  }

  // Reminder is inherently "month to date" — the exclusive end is always
  // tomorrow relative to the real current Dubai date, regardless of which
  // period's month-start the admin asked to preview. nextDayDubaiMidnightISO
  // rolls over month/year via real date arithmetic instead of concatenating
  // `td + 1` into an ISO literal, which produced an invalid out-of-range
  // date (e.g. "...-07-32...") on the last Dubai day of a month.
  const [y, m] = periodParam ? periodParam.split('-').map(Number) : [ty, tm];
  return {
    reportType: 'reminder',
    period: `${y}-${pad(m)}`,
    periodLabel: monthLabel(y, m),
    rangeFromISO: dubaiMidnightISO(y, m, 1),
    rangeToExclusiveISO: nextDayDubaiMidnightISO(ty, tm, td),
    dueDate: `${y}-${pad(m)}-${pad(reminderDay(y, m))}`,
    daysLeftInMonth: lastDayOfMonth(y, m) - td,
  };
}

// --- Period/range resolution for 'send' mode --------------------------------
// mode:'send' takes an EXPLICIT, operator-chosen period (never defaulted —
// unlike resolveTestReport above) and bypasses dueReports()/EARLIEST_PERIOD
// entirely. It exists to seed the very first real report for a pre-launch
// period (July 2026, the only month with real training data — EARLIEST_PERIOD
// = '2026-08' means dueReports() will never surface it on its own).
//
// Unlike resolveTestReport's reminder branch — which deliberately always
// windows through the REAL current Dubai day regardless of the requested
// period, because its entire purpose is "preview as if this ran today" — a
// deliberate one-off send for a period that is NOT the current Dubai month
// must use the period's own full calendar month. Reusing the "always today"
// windowing here would silently span into a second month (or, for a period
// safely in the past, produce an empty/garbled trailing window) — exactly
// the kind of silent-corruption bug this engagement exists to avoid.
function resolveSendReport(
  report: 'monthly' | 'reminder',
  period: string,
  nowUtcMs: number,
): ResolvedTestReport & { delayed: boolean } {
  const [y, m] = period.split('-').map(Number);
  const { ymd: today } = dubaiToday(nowUtcMs);

  if (report === 'monthly') {
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const dueDate = `${nextY}-${pad(nextM)}-01`;
    return {
      reportType: 'monthly_summary',
      period,
      periodLabel: monthLabel(y, m),
      rangeFromISO: dubaiMidnightISO(y, m, 1),
      rangeToExclusiveISO: dubaiMidnightISO(nextY, nextM, 1),
      dueDate,
      // Nominal-due-date rule per the cron path: a period whose due date has
      // already passed relative to "today" is delayed (carries the banner);
      // a period whose due date is today or still in the future is not.
      delayed: today > dueDate,
    };
  }

  const [ty, tm, td] = today.split('-').map(Number);
  const isCurrentMonth = ty === y && tm === m;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const dueDate = `${y}-${pad(m)}-${pad(reminderDay(y, m))}`;
  return {
    reportType: 'reminder',
    period,
    periodLabel: monthLabel(y, m),
    rangeFromISO: dubaiMidnightISO(y, m, 1),
    // Current month -> month-to-date (same windowing dueReports() would use
    // today). Any other month (always in the past in practice: EARLIEST_PERIOD
    // and isValidPeriod's 20xx floor rule out anything materially in the
    // future) -> the period's own full calendar month, since "today" has no
    // relevance to a month that has already closed.
    rangeToExclusiveISO: isCurrentMonth
      ? nextDayDubaiMidnightISO(ty, tm, td)
      : dubaiMidnightISO(nextY, nextM, 1),
    dueDate,
    delayed: today > dueDate,
    daysLeftInMonth: isCurrentMonth ? lastDayOfMonth(y, m) - td : 0,
  };
}

interface RequestBody {
  mode?: string;
  report?: string;
  period?: string;
  confirm?: boolean;
}

// --- Outstanding-failure banner ---------------------------------------------
// Closes a silent-failure gap: a report whose ENTIRE due window fails leaves
// a permanent 'failed' row in report_runs that nothing alerts on (see the
// "Failure modes" honesty note in the design spec). The remedy: the next
// email that DOES successfully go out mentions any other outstanding failed
// (report_type, period) rows, so a human sees it instead of the failure
// staying invisible forever. This only helps once *something* succeeds —
// documented as a residual limitation in the design spec.
// (OutstandingFailure itself is defined in report-html.ts, the module that
// actually renders it, and imported here as a type-only import.)

// Fetches failed report_runs rows other than the one currently being sent,
// oldest period first, capped at 5. A query error is swallowed (never let
// this block a real send — the banner is a nice-to-have, not a gate) but
// reported back via `queryFailed` so callers can log/surface it rather than
// silently pretending there were zero outstanding failures.
async function fetchOutstandingFailures(
  db: ReturnType<typeof serviceClient>,
  excludeReportType: string,
  excludePeriod: string,
): Promise<{ failures: OutstandingFailure[]; queryFailed: boolean }> {
  const { data, error } = await db
    .from('report_runs')
    .select('report_type, period, attempts, last_error')
    .eq('status', 'failed')
    .order('period', { ascending: true });
  if (error) {
    console.error('outstanding-failures query failed (banner omitted for this send):', JSON.stringify(error));
    return { failures: [], queryFailed: true };
  }
  const rows = (data ?? []) as { report_type: string; period: string; attempts: number; last_error: string | null }[];
  const failures = rows
    .filter((r) => !(r.report_type === excludeReportType && r.period === excludePeriod))
    .slice(0, 5)
    .map((r) => ({ reportType: r.report_type, period: r.period, attempts: r.attempts, lastError: r.last_error }));
  return { failures, queryFailed: false };
}

// Total count of currently-outstanding failed rows, for the cron response's
// monitoring field (`outstandingFailures: n`) — independent of any single
// report's exclusion above. Returns null (never blocks) on query error.
async function countFailedReportRuns(db: ReturnType<typeof serviceClient>): Promise<number | null> {
  const { count, error } = await db
    .from('report_runs')
    .select('report_type', { count: 'exact', head: true })
    .eq('status', 'failed');
  if (error) {
    console.error('failed-run count query failed:', JSON.stringify(error));
    return null;
  }
  return count ?? 0;
}

async function handleTest(req: Request, body: RequestBody): Promise<Response> {
  const caller = await getCallerUser(req);
  if (!caller) return json(req, { error: 'Not authenticated.' }, 401);

  const { data: isAdmin } = await callerClient(req).rpc('has_role', { _user_id: caller.id, _role: 'admin' });
  if (!isAdmin) return json(req, { error: 'Unauthorised: admin access required.' }, 403);

  if (body.report !== 'monthly' && body.report !== 'reminder') {
    return json(req, { error: 'report must be "monthly" or "reminder".' }, 400);
  }
  if (body.period !== undefined && !isValidPeriod(body.period)) {
    return json(req, { error: 'period must match YYYY-MM with a month between 01 and 12 (e.g. "2026-07").' }, 400);
  }

  const resolved = resolveTestReport(body.report, body.period, Date.now());
  const db = serviceClient();
  const { sessions, participants, targets } = await fetchReportData(db, resolved.rangeFromISO, resolved.rangeToExclusiveISO);
  const data = aggregateReport(sessions, participants, targets);
  // Deliberately included in test mode too (not just cron/send): this is the
  // only mode an admin can trigger on demand without touching the real
  // ledger, so it doubles as the way to SEE the banner actually working
  // before trusting it in a real send.
  const { failures: outstandingFailures } = await fetchOutstandingFailures(db, resolved.reportType, resolved.period);
  const { subject, html } = renderReportEmail({
    reportType: resolved.reportType,
    periodLabel: resolved.periodLabel,
    data,
    delayed: false,
    dueDate: resolved.dueDate,
    daysLeftInMonth: resolved.daysLeftInMonth,
    testMode: true,
    outstandingFailures,
  });

  const token = await getAppToken();
  await sendMail(token, [caller.email], subject, html);
  return json(req, { ok: true, sentTo: caller.email, subject, period: resolved.period, outstandingFailures: outstandingFailures.length });
}

// Writes the (report_type, period) ledger row's outcome. The row is always
// pre-created by ensureRunRow + claimRun before this is called, so this is a
// plain UPDATE, not an upsert.
//
// The write's own error was previously discarded: if it failed AFTER a
// successful Graph send, no 'sent' row would exist and the next hourly tick
// would send again — for the whole due window now that I3 widened it. This
// retries once, and if it *still* fails that is a loud condition: the caller
// surfaces it via the response's `ledgerErrors` count instead of it being
// silently swallowed.
async function recordRun(
  db: ReturnType<typeof serviceClient>,
  report: DueReport,
  patch: Record<string, unknown>,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await db.from('report_runs')
      .update({ updated_at: new Date().toISOString(), ...patch })
      .eq('report_type', report.reportType)
      .eq('period', report.period);
    if (!error) return true;
    console.error(`report_runs write failed (attempt ${attempt}/2) for ${report.reportType}/${report.period}:`, JSON.stringify(error));
  }
  return false;
}

const CLAIM_SENTINEL = 'send in progress';
const CLAIM_STALE_MS = 15 * 60_000; // 15 minutes

// Ensures a (report_type, period) row exists so claimRun always has
// something to read/update. ignoreDuplicates makes this a no-op once the
// row is already there, regardless of its current status.
async function ensureRunRow(db: ReturnType<typeof serviceClient>, report: DueReport): Promise<void> {
  await db.from('report_runs').upsert(
    { report_type: report.reportType, period: report.period, status: 'failed', attempts: 0 },
    { onConflict: 'report_type,period', ignoreDuplicates: true },
  );
}

// Atomically claims (report_type, period) for a send attempt, so two
// overlapping handleCron invocations (mode:'cron' accepts the public anon
// key, so this is deliberately reachable, not just a pg_cron-overlap edge
// case) cannot both send. Returns the pre-claim attempts count on success,
// or null if another invocation currently holds the claim or the report is
// already sent — the caller counts that as `skipped`.
//
// The spec sketch for the staleness guard (so a crashed run can't wedge a
// row forever) was a single PostgREST `.or('last_error.neq.<sentinel>,
// updated_at.lt.<cutoff>')` filter. That does NOT work: `last_error` is NULL
// on every brand-new row (the common case — nothing has failed yet), and in
// SQL `NULL <> 'x'` evaluates to NULL, not true, so `.neq()` would silently
// fail to match and the FIRST attempt of every new report period would look
// "unclaimable" and be skipped forever. Instead, the staleness decision is
// made here in TS from a row we just read, and the claim UPDATE uses that
// row's own (status, updated_at) as an optimistic-concurrency token: Postgres
// serializes concurrent UPDATEs to the same row, so if another invocation
// claimed it between our read and our write, updated_at will have moved and
// our `.eq('updated_at', ...)` filter matches zero rows — the claim itself
// stays atomic even though the eligibility check is client-side.
async function claimRun(
  db: ReturnType<typeof serviceClient>,
  report: DueReport,
): Promise<{ attempts: number } | null> {
  const { data: row } = await db
    .from('report_runs')
    .select('status, attempts, last_error, updated_at')
    .eq('report_type', report.reportType)
    .eq('period', report.period)
    .maybeSingle();
  const existing = row as { status: string; attempts: number; last_error: string | null; updated_at: string } | null;

  if (!existing || existing.status === 'sent') return null;

  const stale = existing.last_error !== CLAIM_SENTINEL
    || (Date.now() - new Date(existing.updated_at).getTime()) > CLAIM_STALE_MS;
  if (!stale) return null;

  const attempts = existing.attempts + 1;
  const { data: claimed } = await db
    .from('report_runs')
    .update({ status: 'failed', attempts, last_error: CLAIM_SENTINEL, updated_at: new Date().toISOString() })
    .eq('report_type', report.reportType)
    .eq('period', report.period)
    .eq('status', existing.status) // optimistic-concurrency token (only 2 possible values; can't be 'sent' here)
    .eq('updated_at', existing.updated_at) // ditto — moves the instant anyone else writes the row
    .select('report_type');

  if (!claimed || claimed.length === 0) return null;
  return { attempts };
}

// One due report's full attempt: fetch → aggregate → render → send → record.
// Never throws — a failure is recorded to the ledger and reported back as
// 'failed' so the cron loop can move on to the next due report.
async function runDueReport(
  db: ReturnType<typeof serviceClient>,
  report: DueReport,
  attempts: number,
  tokenFor: () => Promise<string>,
  outstandingFailures: OutstandingFailure[] = [],
): Promise<{ outcome: 'sent' | 'failed'; ledgerOk: boolean; error?: string }> {
  try {
    const { sessions, participants, targets } = await fetchReportData(db, report.rangeFromISO, report.rangeToExclusiveISO);
    const data = aggregateReport(sessions, participants, targets);
    const [y, m] = report.period.split('-').map(Number);
    const { subject, html } = renderReportEmail({
      reportType: report.reportType,
      periodLabel: monthLabel(y, m),
      data,
      delayed: report.delayed,
      dueDate: report.dueDate,
      daysLeftInMonth: report.daysLeftInMonth,
      outstandingFailures,
    });

    const token = await tokenFor();
    // At-least-once, not exactly-once: if the Graph POST succeeds but the
    // response is lost (network blip, function timeout) before we reach the
    // recordRun call below, the send already happened but the ledger will
    // still read 'failed' (or mid-claim) and the next tick will retry,
    // sending a second, genuine duplicate email. report_runs' unique key
    // only prevents duplicate ROWS, not duplicate SENDS — there is no
    // idempotency key on the Graph sendMail call itself.
    await sendMail(token, RECIPIENTS, subject, html);
    const ledgerOk = await recordRun(db, report, {
      status: 'sent', attempts, sent_at: new Date().toISOString(), recipients: RECIPIENTS, last_error: null,
    });
    return { outcome: 'sent', ledgerOk };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const ledgerOk = await recordRun(db, report, { status: 'failed', attempts, last_error: message.slice(0, 2000) });
    return { outcome: 'failed', ledgerOk, error: message };
  }
}

async function handleCron(): Promise<{ due: number; sent: number; failed: number; skipped: number; ledgerErrors: number; outstandingFailures: number }> {
  const due = dueReports(Date.now());
  const db = serviceClient();

  // Fetched lazily on the first real send attempt (and cached across the
  // loop) so a quiet run with nothing due never touches the token endpoint.
  let cachedToken: string | null = null;
  const tokenFor = async () => {
    if (!cachedToken) cachedToken = await getAppToken();
    return cachedToken;
  };

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let ledgerErrors = 0;

  for (const report of due) {
    await ensureRunRow(db, report);
    const claim = await claimRun(db, report);
    if (!claim) { skipped++; continue; }

    // Queried fresh right before each render (not once for the whole loop):
    // an earlier report in THIS same run that just failed should already be
    // visible in a later report's banner within the same invocation.
    const { failures: outstandingFailures } = await fetchOutstandingFailures(db, report.reportType, report.period);
    const { outcome, ledgerOk } = await runDueReport(db, report, claim.attempts, tokenFor, outstandingFailures);
    if (outcome === 'sent') sent++; else failed++;
    if (!ledgerOk) ledgerErrors++;
  }

  const outstandingFailures = await countFailedReportRuns(db);
  return { due: due.length, sent, failed, skipped, ledgerErrors, outstandingFailures: outstandingFailures ?? 0 };
}

// mode:'send' — deliberate, operator-triggered, real one-off send.
//
// Why this exists: EARLIEST_PERIOD ('2026-08') means dueReports() will NEVER
// surface July 2026 — the only month with real training data — so the first
// automated email everyone receives would otherwise be an empty/near-empty
// August report. This mode lets an admin explicitly pick a period and force
// a real send for it, once, so the first email people actually get contains
// real numbers.
//
// Safety properties (all required, see design spec "Modes" section):
//   - Admin-gated exactly like mode:'test' (fail closed on missing/invalid JWT
//     or a non-admin caller).
//   - confirm:true is REQUIRED (no silent default) — the request is otherwise
//     rejected with 400 and an explanation that this sends to the REAL
//     recipient list, not just the caller.
//   - period is REQUIRED (never defaulted) and validated the same way as
//     mode:'test'.
//   - Sends to RECIPIENTS (not the caller) with a normal (non-"[TEST]")
//     subject.
//   - Bypasses dueReports()/EARLIEST_PERIOD entirely: the period is explicit
//     and operator-chosen, not schedule-derived.
//   - Fully participates in the report_runs ledger via the SAME
//     ensureRunRow/claimRun/recordRun path mode:'cron' uses, so it can never
//     double-send: an already-'sent' row, or a row currently claimed by a
//     concurrent invocation, both short-circuit to 409 before any send is
//     attempted.
async function handleSend(req: Request, body: RequestBody): Promise<Response> {
  const caller = await getCallerUser(req);
  if (!caller) return json(req, { error: 'Not authenticated.' }, 401);

  const { data: isAdmin } = await callerClient(req).rpc('has_role', { _user_id: caller.id, _role: 'admin' });
  if (!isAdmin) return json(req, { error: 'Unauthorised: admin access required.' }, 403);

  if (body.report !== 'monthly' && body.report !== 'reminder') {
    return json(req, { error: 'report must be "monthly" or "reminder".' }, 400);
  }
  if (typeof body.period !== 'string' || !isValidPeriod(body.period)) {
    return json(req, { error: 'period is required and must match YYYY-MM with a month between 01 and 12 (e.g. "2026-07").' }, 400);
  }
  if (body.confirm !== true) {
    return json(req, {
      error: 'confirm:true is required. mode:"send" sends a REAL email to the real recipient list '
        + `(${RECIPIENTS.join(', ')}) — not just the caller. Re-send the request with confirm:true once you are certain.`,
    }, 400);
  }

  const resolved = resolveSendReport(body.report, body.period, Date.now());
  const db = serviceClient();
  const report: DueReport = {
    reportType: resolved.reportType,
    period: resolved.period,
    dueDate: resolved.dueDate,
    delayed: resolved.delayed,
    rangeFromISO: resolved.rangeFromISO,
    rangeToExclusiveISO: resolved.rangeToExclusiveISO,
    daysLeftInMonth: resolved.daysLeftInMonth,
  };

  await ensureRunRow(db, report);
  const claim = await claimRun(db, report);
  if (!claim) {
    // Either already 'sent' (the common, expected case an operator hits when
    // re-running this by mistake) or currently held by a concurrent
    // invocation — both are refused, and both surface whatever the ledger
    // row actually says so the operator can see it already went out (or is
    // in flight) instead of getting a bare "no" with no evidence.
    const { data: existing } = await db
      .from('report_runs')
      .select('status, sent_at, recipients')
      .eq('report_type', report.reportType)
      .eq('period', report.period)
      .maybeSingle();
    return json(req, {
      error: existing?.status === 'sent'
        ? 'Already sent — refusing to send again.'
        : 'Send already in progress for this report/period (claimed by a concurrent invocation) — refusing to send again.',
      status: existing?.status ?? null,
      sentAt: existing?.sent_at ?? null,
      recipients: existing?.recipients ?? null,
    }, 409);
  }

  const { failures: outstandingFailures } = await fetchOutstandingFailures(db, report.reportType, report.period);

  let cachedToken: string | null = null;
  const tokenFor = async () => {
    if (!cachedToken) cachedToken = await getAppToken();
    return cachedToken;
  };

  const { outcome, error } = await runDueReport(db, report, claim.attempts, tokenFor, outstandingFailures);
  if (outcome === 'failed') {
    return json(req, { error: error ?? 'Send failed.', period: resolved.period }, 500);
  }
  return json(req, { ok: true, sent: 1, period: resolved.period, recipients: RECIPIENTS, outstandingFailures: outstandingFailures.length });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return json(req, { error: 'Method not allowed' }, 405);
  }
  if (!haveAzureCreds()) {
    return json(req, { error: 'Missing Azure credentials: set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET as Supabase secrets.' }, 503);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body.' }, 400);
  }

  const mode = body?.mode;
  if (mode !== 'test' && mode !== 'cron' && mode !== 'send') {
    return json(req, { error: 'Unknown mode.' }, 400);
  }

  try {
    if (mode === 'test') return await handleTest(req, body);
    if (mode === 'send') return await handleSend(req, body);
    const result = await handleCron();
    return json(req, { ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('training-report error:', message);
    // Surface the real upstream status (e.g. 403 = Graph permission missing,
    // 429 = rate-limited past graphFetch's own retries) instead of masking
    // every failure as a generic 500.
    const status = err instanceof GraphError ? err.status : 500;
    return json(req, { error: message }, status);
  }
});
