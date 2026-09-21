// Pure aggregation for the Sera Voice page. No React, no Supabase — unit-tested under
// bare `node --test`, so every value import is RELATIVE and carries its `.ts` extension
// (node has no '@/' alias and no extension resolution; type-only imports are erased).
import { formatInTimeZone } from 'date-fns-tz';
import type { Database } from '../integrations/supabase/types.ts';
import { countBy, dailySeriesByDateKey, safeNum } from '../hooks/insights/utils.ts';

const DUBAI_TZ = 'Asia/Dubai';

/**
 * The ONE place the list columns live. It is a string LITERAL (not `string`) so that
 * postgrest-js can parse it and type `.select(SERA_VOICE_LIST_COLUMNS)` as exactly these
 * columns; `SeraVoiceCallRow` is derived from the same literal, so the two cannot drift.
 */
// One literal on one line on purpose: `'a' + 'b'` widens to `string` and would break the typing.
export const SERA_VOICE_LIST_COLUMNS =
  'conversation_id,status,archive_state,started_at,call_date,duration_secs,duration_minutes,answer_delay_secs,message_count,caller_extension,sip_caller_type,termination_reason,call_successful,summary_title,summary,main_language,cost_credits,cost_usd,llm_cost_usd,cost_per_minute_usd,tools_used,tool_error_count,interruption_count,is_answered,transferred_to,room_rate_quoted,qms_request,version_id';

/** Splits a comma-separated literal into a union of its column names. */
type ColumnsOf<S extends string> = S extends `${infer Head},${infer Tail}` ? Head | ColumnsOf<Tail> : S;

export type SeraVoiceCallRow = Pick<
  Database['public']['Views']['sera_voice_calls_v']['Row'],
  ColumnsOf<typeof SERA_VOICE_LIST_COLUMNS>
>;

export interface SeraVoiceKpis {
  answered: number;
  unanswered: number;
  totalMinutes: number;
  avgDurationSecs: number;
  credits: number;
  costUsd: number;
  costPerMinuteUsd: number;
  successRatePct: number;
  transfers: number;
  rateQuotes: number;
  qmsRequests: number;
}

export interface SeraVoiceInsights {
  rows: SeraVoiceCallRow[];
  kpis: SeraVoiceKpis;
  callsPerDay: { date: string; label: string; value: number }[];
  minutesPerDay: { date: string; label: string; value: number }[];
  byHour: { hour: number; label: string; value: number }[];
  outcomeSplit: { name: string; value: number }[];
  toolUsage: { name: string; value: number }[];
  transfersByExtension: { name: string; value: number }[];
}

const OUTCOMES = new Set(['success', 'failure', 'unknown']);

const EXTENSION_LABELS: Record<string, string> = {
  '8008': 'Reservations (8008)',
  '8013': 'Reception (8013)',
};

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return safeNum(Math.round(safeNum(n) * f) / f);
};

/** Dubai hour (0-23) of a timestamptz string; null when the value does not parse. */
const dubaiHour = (startedAt: string | null | undefined): number | null => {
  if (!startedAt) return null;
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return null;
  const h = Number(formatInTimeZone(d, DUBAI_TZ, 'H'));
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
};

const outcomeOf = (row: SeraVoiceCallRow): string => {
  const v = (row.call_successful ?? '').trim().toLowerCase();
  return OUTCOMES.has(v) ? v : 'unknown';
};

const toolsOf = (row: SeraVoiceCallRow): string[] => {
  const list = Array.isArray(row.tools_used) ? row.tools_used : [];
  const out = new Set<string>();
  for (const t of list) {
    const name = typeof t === 'string' ? t.trim() : '';
    if (name) out.add(name);
  }
  return Array.from(out);
};

const extensionLabel = (ext: string): string => EXTENSION_LABELS[ext] ?? ext;

/** Newest first by started_at; rows without a parseable started_at sink to the end. */
const sortNewestFirst = (rows: SeraVoiceCallRow[]): SeraVoiceCallRow[] => {
  const ts = (r: SeraVoiceCallRow): number => {
    const t = r.started_at ? new Date(r.started_at).getTime() : Number.NaN;
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  };
  return [...rows].sort((a, b) => ts(b) - ts(a));
};

export function aggregateSeraVoice(
  rows: SeraVoiceCallRow[],
  fromDateKey: string,
  toDateKey: string
): SeraVoiceInsights {
  const all = Array.isArray(rows) ? rows.filter((r): r is SeraVoiceCallRow => !!r && typeof r === 'object') : [];
  const answered = all.filter((r) => r.is_answered === true);
  const unanswered = all.length - answered.length;

  // Money / time / outcome KPIs are over answered calls only (an unanswered attempt has 0 s
  // and no cost). Tool-derived flags (transfer, rate quote, QMS) are counted over every row.
  let totalSecs = 0;
  let credits = 0;
  let costUsd = 0;
  let success = 0;
  for (const r of answered) {
    totalSecs += safeNum(r.duration_secs);
    credits += safeNum(r.cost_credits);
    costUsd += safeNum(r.cost_usd);
    if (outcomeOf(r) === 'success') success += 1;
  }
  let transfers = 0;
  let rateQuotes = 0;
  let qmsRequests = 0;
  for (const r of all) {
    if ((r.transferred_to ?? '').trim()) transfers += 1;
    if (r.room_rate_quoted === true) rateQuotes += 1;
    if (r.qms_request === true) qmsRequests += 1;
  }

  const totalMinutes = round(totalSecs / 60, 1);
  const avgDurationSecs = answered.length ? Math.round(totalSecs / answered.length) : 0;
  const costPerMinuteUsd = totalMinutes > 0 ? round(costUsd / totalMinutes, 3) : 0;
  const successRatePct = answered.length ? Math.round((success / answered.length) * 100) : 0;

  const kpis: SeraVoiceKpis = {
    answered: safeNum(answered.length),
    unanswered: safeNum(unanswered),
    totalMinutes: safeNum(totalMinutes),
    avgDurationSecs: safeNum(avgDurationSecs),
    credits: safeNum(credits),
    costUsd: safeNum(round(costUsd, 6)),
    costPerMinuteUsd: safeNum(costPerMinuteUsd),
    successRatePct: safeNum(successRatePct),
    transfers: safeNum(transfers),
    rateQuotes: safeNum(rateQuotes),
    qmsRequests: safeNum(qmsRequests),
  };

  const dateKeyOf = (r: SeraVoiceCallRow): string | null => (r.call_date ? String(r.call_date).slice(0, 10) : null);

  const callsPerDay = dailySeriesByDateKey(fromDateKey, toDateKey, answered, dateKeyOf).map((p) => ({
    ...p,
    value: safeNum(p.value),
  }));

  const minutesPerDay = dailySeriesByDateKey(fromDateKey, toDateKey, answered, dateKeyOf, (bucket) =>
    round(bucket.reduce((acc, r) => acc + safeNum(r.duration_secs), 0) / 60, 1)
  ).map((p) => ({ ...p, value: safeNum(p.value) }));

  const hourCounts = new Array<number>(24).fill(0);
  for (const r of answered) {
    const h = dubaiHour(r.started_at);
    if (h !== null) hourCounts[h] += 1;
  }
  const byHour = hourCounts.map((value, hour) => ({
    hour,
    label: String(hour).padStart(2, '0'),
    value: safeNum(value),
  }));

  const outcomeSplit = countBy(answered, outcomeOf).map((p) => ({ ...p, value: safeNum(p.value) }));

  const toolCounts = new Map<string, number>();
  for (const r of all) {
    for (const tool of toolsOf(r)) toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
  }
  const toolUsage = Array.from(toolCounts.entries())
    .map(([name, value]) => ({ name, value: safeNum(value) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  const transferred = all
    .map((r) => (r.transferred_to ?? '').trim())
    .filter((ext) => ext.length > 0)
    .map((ext) => ({ ext }));
  const transfersByExtension = countBy(transferred, (t) => extensionLabel(t.ext)).map((p) => ({
    ...p,
    value: safeNum(p.value),
  }));

  return {
    rows: sortNewestFirst(all),
    kpis,
    callsPerDay,
    minutesPerDay,
    byHour,
    outcomeSplit,
    toolUsage,
    transfersByExtension,
  };
}
