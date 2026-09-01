// Fetches the always-on dashboard context: real Two Seasons tables, scoped to
// the date range implied by the user's question (if any). Every domain fetch
// is best-effort — a failure in one table must not block the others, and
// Sera must be told about it (via `errors`) rather than silently seeing an
// empty section that looks like "no data exists".
import { buildDateRange } from './training-aggregator.ts';

export interface DashboardDomain {
  rows: any[];
  count: number | null;
}

export interface DashboardSnapshot {
  reviews: DashboardDomain;
  whatsapp: DashboardDomain;
  seraEmails: DashboardDomain;
  infoEmails: DashboardDomain;
  competitorRates: DashboardDomain;
  social: DashboardDomain;
  welcome: DashboardDomain;
  errors: string[];
}

const CAPS = { reviews: 60, whatsapp: 200, seraEmails: 40, infoEmails: 40, competitorRates: 120, social: 40, welcome: 40 };

export function resolveDateBounds(qa: { startDate?: string; endDate?: string }) {
  if (!qa?.startDate && !qa?.endDate) return {};
  const clamp = (s?: string) => {
    if (!s) return undefined;
    const [y, m, d] = s.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // query-analyzer emits day 31 for every month
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
  };
  const fromDateKey = clamp(qa.startDate);
  const toDateKey = clamp(qa.endDate);
  const range = buildDateRange(fromDateKey, toDateKey);
  if (range.error) return {};
  return { fromISO: range.fromISO, toExclusiveISO: range.toExclusiveISO, fromDateKey, toDateKey };
}

function tsQuery(supabase: any, table: string, cols: string, tsCol: string, b: ReturnType<typeof resolveDateBounds>, cap: number) {
  let q = supabase.from(table).select(cols, { count: 'exact' }).order(tsCol, { ascending: false }).limit(cap);
  if (b.fromISO) q = q.gte(tsCol, b.fromISO);
  if (b.toExclusiveISO) q = q.lt(tsCol, b.toExclusiveISO);
  return q;
}

function dateQuery(supabase: any, table: string, cols: string, dateCol: string, b: ReturnType<typeof resolveDateBounds>, cap: number) {
  let q = supabase.from(table).select(cols, { count: 'exact' }).order(dateCol, { ascending: false }).limit(cap);
  if (b.fromDateKey) q = q.gte(dateCol, b.fromDateKey);
  if (b.toDateKey) q = q.lte(dateCol, b.toDateKey);
  return q;
}

export async function fetchDashboardSnapshot(supabase: any, qa: { startDate?: string; endDate?: string }): Promise<DashboardSnapshot> {
  const b = resolveDateBounds(qa);
  const [reviews, whatsapp, seraEmails, infoEmails, competitorRates, social, welcome] = await Promise.allSettled([
    // LongTermMemory is deliberately NOT here: it has no user_id, is staff-wide, and reading it
    // injected every colleague's Sera turns into every other user's prompt (audit E4).
    dateQuery(supabase, 'Two Seasons and Reviews', 'id,"Date","Hotel Name",Source,Language,Score,Author,Title,Text', 'Date', b, CAPS.reviews),
    tsQuery(supabase, 'Chat History', 'id,created_at,"Sender Number",Name,"Sender Message","Ai Reply",human_reply,is_human_controlled', 'created_at', b, CAPS.whatsapp),
    tsQuery(supabase, '2Seasons_Sera_Email_Log', 'id,sent_at,email_type,category,nature_of_request,guest_name,email_subject', 'sent_at', b, CAPS.seraEmails),
    tsQuery(supabase, 'info_email_audit_log', 'id,created_at,subject,sender,action,department,confidence,override', 'created_at', b, CAPS.infoEmails),
    dateQuery(supabase, 'Two Seasons Competitor Hotel room Rates', 'id,report_date,hotel_name,checkin_date,converted_price_aed,status,is_lowest_for_day', 'report_date', b, CAPS.competitorRates).eq('dry_run', false).in('status', ['success', 'price_found']),
    tsQuery(supabase, 'social_engagement_logs', 'id,created_at,platform,channel,event_type,sender_name,guest_message_text,escalation_flag,status', 'created_at', b, CAPS.social),
    tsQuery(supabase, 'welcome_message_success_log', 'id,sent_at,sent_date,full_name,room_number,arrival_date,status', 'sent_at', b, CAPS.welcome),
  ]);
  const unwrap = (r: PromiseSettledResult<any>, label: string, errors: string[]) => {
    if (r.status === 'rejected') { errors.push(`${label}: ${r.reason}`); return { rows: [], count: null }; }
    if (r.value.error) { errors.push(`${label}: ${r.value.error.message}`); return { rows: [], count: null }; }
    return { rows: r.value.data ?? [], count: r.value.count ?? null };
  };
  const errors: string[] = [];
  return {
    reviews: unwrap(reviews, 'reviews', errors),
    whatsapp: unwrap(whatsapp, 'whatsapp', errors),
    seraEmails: unwrap(seraEmails, 'seraEmails', errors),
    infoEmails: unwrap(infoEmails, 'infoEmails', errors),
    competitorRates: unwrap(competitorRates, 'competitorRates', errors),
    social: unwrap(social, 'social', errors),
    welcome: unwrap(welcome, 'welcome', errors),
    errors,
  };
}
