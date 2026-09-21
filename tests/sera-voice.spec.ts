import { test, expect, type Page } from '@playwright/test';
import { setMockAuthSession, PROJECT_REF } from './helpers/hotel-training-mocks';

// /dashboard/sera-voice reads three relations through PostgREST:
//   sera_voice_calls_v            → the KPI/table rows (useSeraVoiceInsights)
//   sera_voice_call_turns         → the transcript (useSeraVoiceCall)
//   sera_voice_call_tool_events   → the tool chips under agent turns (useSeraVoiceCall)
// Every case here mocks all three by URL, with an explicit `[]` default so an
// unexpected relation answers empty instead of leaving the request hanging (an
// unfulfilled route makes the Suspense wait below time out for a reason that
// looks nothing like the cause).

const REST_GLOB = `https://${PROJECT_REF}.supabase.co/rest/v1/**`;
const ROUTE = '/dashboard/sera-voice';

// Every column in SERA_VOICE_LIST_COLUMNS (src/lib/sera-voice-aggregate.ts), so
// the aggregate sees the same shape PostgREST returns for the real view.
function callRow(overrides: Record<string, unknown>) {
  return {
    conversation_id: 'conv_x',
    status: 'done',
    archive_state: 'archived',
    started_at: '2026-09-20T17:30:00+00:00',
    call_date: '2026-09-20',
    duration_secs: 83,
    duration_minutes: 1.38,
    answer_delay_secs: 1.2,
    message_count: 6,
    caller_extension: '1203',
    sip_caller_type: 'room',
    termination_reason: 'end_call tool was called.',
    call_successful: 'success',
    summary_title: 'Room rate enquiry',
    summary: 'The guest asked for tonight\'s room rate and Sera quoted it.',
    main_language: 'en',
    cost_credits: 441,
    cost_usd: 0.32,
    llm_cost_usd: 0.047,
    cost_per_minute_usd: 0.23,
    tools_used: [],
    tool_error_count: 0,
    interruption_count: 0,
    is_answered: true,
    transferred_to: null,
    room_rate_quoted: false,
    qms_request: false,
    version_id: 'agtvrsn_test',
    ...overrides,
  };
}

const ROWS = [
  callRow({
    conversation_id: 'conv_1',
    started_at: '2026-09-20T17:30:00+00:00',
    tools_used: ['GetRoomRate'],
    transferred_to: '8008',
    room_rate_quoted: true,
    summary_title: 'Room rate then transfer to reservations',
  }),
  callRow({
    conversation_id: 'conv_2',
    started_at: '2026-09-20T15:05:00+00:00',
    call_successful: 'failure',
    summary_title: 'Caller hung up mid-request',
    duration_secs: 40,
    cost_credits: 210,
    cost_usd: 0.15,
  }),
  callRow({
    conversation_id: 'conv_3',
    started_at: '2026-09-20T12:00:00+00:00',
    status: 'failed',
    is_answered: false,
    call_successful: null,
    summary_title: null,
    summary: null,
    duration_secs: 0,
    duration_minutes: 0,
    message_count: 0,
    cost_credits: 0,
    cost_usd: 0,
    llm_cost_usd: 0,
    cost_per_minute_usd: 0,
    termination_reason: 'no_answer',
  }),
];

const TURNS = [
  {
    conversation_id: 'conv_1',
    turn_index: 0,
    role: 'agent',
    message: 'Good evening, Two Seasons Hotel, Sera speaking. How can I help?',
    time_in_call_secs: 0,
    interrupted: false,
    tool_calls: [{ type: 'client', tool_name: 'GetRoomRate', params_as_json: '{"date":"2026-09-20"}', request_id: 'req_1' }],
    tool_results: null,
  },
  {
    conversation_id: 'conv_1',
    turn_index: 1,
    role: 'user',
    message: 'How much is a deluxe room for tonight?',
    time_in_call_secs: 4,
    interrupted: false,
    tool_calls: null,
    tool_results: null,
  },
];

const TOOL_EVENTS = [
  {
    turn_index: 0,
    event_index: 0,
    tool_name: 'GetRoomRate',
    params: { date: '2026-09-20' },
    result_status: 'success',
    result_excerpt: 'Deluxe room AED 450',
    is_error: false,
    latency_secs: 0.7,
  },
];

type Mode = { rows: unknown[] | 'fail'; viewRequests?: string[] };

async function openSeraVoice(page: Page, mode: Mode) {
  await setMockAuthSession(page);
  await page.route(REST_GLOB, (r) => {
    const url = r.request().url();
    if (url.includes('/sera_voice_calls_v')) {
      mode.viewRequests?.push(url);
      return mode.rows === 'fail'
        ? r.fulfill({ status: 500, json: { message: 'simulated PostgREST failure' } })
        : r.fulfill({ json: mode.rows });
    }
    if (url.includes('/sera_voice_call_turns')) return r.fulfill({ json: TURNS });
    if (url.includes('/sera_voice_call_tool_events')) return r.fulfill({ json: TOOL_EVENTS });
    return r.fulfill({ json: [] });
  });
  await page.goto(ROUTE);
  // Same Suspense-aware wait as kpi-error-states.spec.ts: the lazy route's
  // fallback renders no <main>.
  await page.locator('main').waitFor({ state: 'attached' });
  await page.locator('main h1, main h2, main h3').first().waitFor({ state: 'visible' });
}

/** The value <p> of the KpiCard whose label is exactly `label`. */
const kpiValue = (page: Page, label: string) =>
  page.locator(`xpath=//main//p[normalize-space()=${JSON.stringify(label)}]/following-sibling::p[@data-kpi-state]`);

const kpis = (page: Page, state: 'error' | 'loading' | 'ready') => page.locator(`main [data-kpi-state="${state}"]`);

test('renders KPIs, the calls table and the sidebar link from mocked view rows', async ({ page, viewport }) => {
  await openSeraVoice(page, { rows: ROWS });

  await expect(kpiValue(page, 'Calls answered')).toHaveText('2', { timeout: 15_000 });
  await expect(kpiValue(page, 'Calls answered')).toHaveAttribute('data-kpi-state', 'ready');
  await expect(kpiValue(page, 'Unanswered attempts')).toHaveText('1');
  await expect(kpiValue(page, 'Transfers')).toHaveText('1');
  await expect(kpiValue(page, 'Rate quotes')).toHaveText('1');

  const rows = page.locator('main table tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'Unanswered' })).toHaveCount(1);
  await expect(page.locator('main table').getByText('GetRoomRate', { exact: true })).toBeVisible();
  await expect(page.locator('main table').getByText('8008', { exact: true })).toBeVisible();

  // The sidebar is an off-canvas sheet below md; open it there before asserting.
  const link = page.getByRole('link', { name: 'Sera Voice' });
  if ((viewport?.width ?? 1280) < 768) {
    await page.getByRole('button', { name: 'Toggle Sidebar' }).first().click();
  }
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', ROUTE);
});

test('clicking a row opens the transcript sheet with both turns and a tool chip', async ({ page }) => {
  await openSeraVoice(page, { rows: ROWS });
  await expect(page.locator('main table tbody tr')).toHaveCount(3, { timeout: 15_000 });

  await page.locator('main table tbody tr').first().click();

  // The sheet is portalled outside <main>; scope to the dialog, not main.
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Good evening, Two Seasons Hotel, Sera speaking. How can I help?')).toBeVisible();
  await expect(sheet.getByText('How much is a deluxe room for tonight?')).toBeVisible();
  await expect(sheet.locator('[data-turn-role="agent"]')).toHaveCount(1);
  await expect(sheet.locator('[data-turn-role="user"]')).toHaveCount(1);
  await expect(sheet.getByText('GetRoomRate · success · 0.7 s')).toBeVisible();
});

test('a failed view query marks every KPI as error and renders no digits', async ({ page }) => {
  await openSeraVoice(page, { rows: 'fail' });

  // react-query retries once (src/App.tsx), so the failure lands after attempt two.
  await expect(kpis(page, 'error').first()).toBeVisible({ timeout: 15_000 });
  await expect(kpis(page, 'ready')).toHaveCount(0);
  await expect(kpis(page, 'loading')).toHaveCount(0);
  // Every one of the page's eleven KPIs is flagged, not just the first.
  await expect(kpis(page, 'error')).toHaveCount(11);
  await expect(page.getByText("Couldn't load this figure").first()).toBeVisible();

  const errorTexts = await kpis(page, 'error').allInnerTexts();
  expect(errorTexts.length).toBe(11);
  for (const text of errorTexts) {
    expect(text.trim(), 'a failed KPI must not render a numeric value').not.toMatch(/\d/);
  }
  await expect(page.locator('main [data-chart-state="error"]').first()).toBeVisible();
  await expect(page.locator('main .recharts-wrapper')).toHaveCount(0);
  await expect(page.getByTestId('sera-voice-empty')).toHaveCount(0);
});

test('CONTROL: an empty range shows the empty-state card and a real 0 in the ready state', async ({ page }) => {
  const viewRequests: string[] = [];
  await openSeraVoice(page, { rows: [], viewRequests });

  await expect(page.getByTestId('sera-voice-empty')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('No Sera calls in this range')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show last 30 days' })).toBeVisible();

  await expect(kpiValue(page, 'Calls answered')).toHaveText('0');
  await expect(kpiValue(page, 'Calls answered')).toHaveAttribute('data-kpi-state', 'ready');
  await expect(kpis(page, 'error')).toHaveCount(0);
  await expect(page.getByText("Couldn't load this figure")).toHaveCount(0);
  await expect(page.locator('main table tbody tr')).toHaveCount(0);

  // The button is wired to the date-range preset: a widened range re-queries the
  // view with an earlier `call_date=gte.` bound. Asserted on the request rather
  // than on any "Last 30 days" text, which the button itself would match.
  const lowerBound = (url: string) => new URL(url).searchParams.get('call_date') ?? '';
  const before = viewRequests.length;
  expect(before).toBeGreaterThan(0);
  const firstBound = lowerBound(viewRequests[0]);
  await page.getByRole('button', { name: 'Show last 30 days' }).click();
  await expect.poll(() => viewRequests.length, { timeout: 10_000 }).toBeGreaterThan(before);
  const widened = lowerBound(viewRequests[viewRequests.length - 1]);
  expect(widened).toMatch(/^gte\./);
  expect(widened < firstBound, `expected an earlier lower bound than ${firstBound}, got ${widened}`).toBe(true);
});
