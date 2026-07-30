import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerUser } from '../_shared/auth.ts';
import { haveAzureCreds, getAppToken, graphFetch, GRAPH_BASE, GraphError } from '../_shared/graph.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchAllWithCap } from '../chat-with-data/paged-fetch.ts';
import { dueReports, dubaiToday, lastDayOfMonth, reminderDay } from './report-schedule.ts';
import type { DueReport } from './report-schedule.ts';
import { aggregateReport } from './report-aggregator.ts';
import { renderReportEmail } from './report-html.ts';

const SENDER = 'sera@2seasonshotels.com';
const RECIPIENTS = [
  'amir.monir@2seasonshotels.com',
  'xarmaigne.narciso@2seasonshotels.com',
  'ahmed.mokhtar@2seasonshotels.com',
];
const SESSION_CAP = 2000;
const PARTICIPANT_CAP = 10000;

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
  const ids = sessions.rows.map((s) => s.training_id);
  let participants = { rows: [] as { training_id: string; employee_id: string | null }[] };
  if (ids.length > 0) {
    const p = await fetchAllWithCap((from, to, withCount) =>
      db.from('training_participants')
        .select('training_id, employee_id', withCount ? { count: 'exact' } : {})
        .in('training_id', ids)
        .order('id', { ascending: true })
        .range(from, to), PARTICIPANT_CAP);
    if (p.error) throw new Error(`participants fetch failed: ${JSON.stringify(p.error)}`);
    participants = p;
  }
  const t = await db.from('training_targets').select('department, monthly_target_hours');
  if (t.error) throw new Error(`targets fetch failed: ${JSON.stringify(t.error)}`);
  return { sessions: sessions.rows, participants: participants.rows, targets: t.data ?? [] };
}

// --- Period/range resolution for 'test' mode -------------------------------
// dueReports() only ever looks at "now"; the admin test probe needs to
// resolve a period/range the same way even when today isn't a due day (or
// when an explicit period override is given), so this duplicates just the
// midnight-ISO formatting dueReports() keeps private to report-schedule.ts.

const pad = (n: number) => String(n).padStart(2, '0');
const dubaiMidnightISO = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}T00:00:00+04:00`;

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
      dueDate: `${y}-${pad(m)}-01`,
    };
  }

  // Reminder is inherently "month to date" — the exclusive end is always
  // tomorrow relative to the real current Dubai date, regardless of which
  // period's month-start the admin asked to preview.
  const [y, m] = periodParam ? periodParam.split('-').map(Number) : [ty, tm];
  return {
    reportType: 'reminder',
    period: `${y}-${pad(m)}`,
    periodLabel: monthLabel(y, m),
    rangeFromISO: dubaiMidnightISO(y, m, 1),
    rangeToExclusiveISO: dubaiMidnightISO(ty, tm, td + 1),
    dueDate: `${y}-${pad(m)}-${pad(reminderDay(y, m))}`,
    daysLeftInMonth: lastDayOfMonth(y, m) - td,
  };
}

interface RequestBody {
  mode?: string;
  report?: string;
  period?: string;
}

async function handleTest(req: Request, body: RequestBody): Promise<Response> {
  const caller = await getCallerUser(req);
  if (!caller) return json(req, { error: 'Not authenticated.' }, 401);

  const { data: isAdmin } = await callerClient(req).rpc('has_role', { _user_id: caller.id, _role: 'admin' });
  if (!isAdmin) return json(req, { error: 'Unauthorised: admin access required.' }, 403);

  if (body.report !== 'monthly' && body.report !== 'reminder') {
    return json(req, { error: 'report must be "monthly" or "reminder".' }, 400);
  }

  const resolved = resolveTestReport(body.report, body.period, Date.now());
  const db = serviceClient();
  const { sessions, participants, targets } = await fetchReportData(db, resolved.rangeFromISO, resolved.rangeToExclusiveISO);
  const data = aggregateReport(sessions, participants, targets);
  const { subject, html } = renderReportEmail({
    reportType: resolved.reportType,
    periodLabel: resolved.periodLabel,
    data,
    delayed: false,
    dueDate: resolved.dueDate,
    daysLeftInMonth: resolved.daysLeftInMonth,
    testMode: true,
  });

  const token = await getAppToken();
  await sendMail(token, [caller.email], subject, html);
  return json(req, { ok: true, sentTo: caller.email, subject, period: resolved.period });
}

// Upserts the (report_type, period) ledger row — the single write path both
// the 'sent' and 'failed' branches of runDueReport share, so report_runs
// (report_type, period) primary key and the updated_at stamp are set once.
async function recordRun(
  db: ReturnType<typeof serviceClient>,
  report: DueReport,
  patch: Record<string, unknown>,
): Promise<void> {
  await db.from('report_runs').upsert({
    report_type: report.reportType,
    period: report.period,
    updated_at: new Date().toISOString(),
    ...patch,
  });
}

// One due report's full attempt: fetch → aggregate → render → send → record.
// Never throws — a failure is recorded to the ledger and reported back as
// 'failed' so the cron loop can move on to the next due report.
async function runDueReport(
  db: ReturnType<typeof serviceClient>,
  report: DueReport,
  attempts: number,
  tokenFor: () => Promise<string>,
): Promise<'sent' | 'failed'> {
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
    });

    const token = await tokenFor();
    await sendMail(token, RECIPIENTS, subject, html);
    await recordRun(db, report, {
      status: 'sent', attempts, sent_at: new Date().toISOString(), recipients: RECIPIENTS, last_error: null,
    });
    return 'sent';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRun(db, report, { status: 'failed', attempts, last_error: message.slice(0, 2000) });
    return 'failed';
  }
}

async function handleCron(): Promise<{ due: number; sent: number; failed: number }> {
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
  for (const report of due) {
    const { data: existing } = await db
      .from('report_runs')
      .select('status, attempts')
      .eq('report_type', report.reportType)
      .eq('period', report.period)
      .maybeSingle();
    if (existing?.status === 'sent') continue;

    const outcome = await runDueReport(db, report, (existing?.attempts ?? 0) + 1, tokenFor);
    if (outcome === 'sent') sent++; else failed++;
  }

  return { due: due.length, sent, failed };
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
  if (mode !== 'test' && mode !== 'cron') {
    return json(req, { error: 'Unknown mode.' }, 400);
  }

  try {
    if (mode === 'test') return await handleTest(req, body);
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
