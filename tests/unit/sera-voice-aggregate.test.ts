import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateSeraVoice, SERA_VOICE_LIST_COLUMNS } from '../../src/lib/sera-voice-aggregate.ts';
import type { SeraVoiceCallRow } from '../../src/lib/sera-voice-aggregate.ts';

// Every view field is nullable; a fixture starts from all-nulls and overrides what the case needs.
const nulls = (): SeraVoiceCallRow => ({
  conversation_id: null,
  status: null,
  archive_state: null,
  started_at: null,
  call_date: null,
  duration_secs: null,
  duration_minutes: null,
  answer_delay_secs: null,
  message_count: null,
  caller_extension: null,
  sip_caller_type: null,
  termination_reason: null,
  call_successful: null,
  summary_title: null,
  summary: null,
  main_language: null,
  cost_credits: null,
  cost_usd: null,
  llm_cost_usd: null,
  cost_per_minute_usd: null,
  tools_used: null,
  tool_error_count: null,
  interruption_count: null,
  is_answered: null,
  transferred_to: null,
  room_rate_quoted: null,
  qms_request: null,
  version_id: null,
});

const row = (over: Partial<SeraVoiceCallRow>): SeraVoiceCallRow => ({ ...nulls(), ...over });

const FROM = '2026-09-17';
const TO = '2026-09-19';

// 2 answered (one transferred to 8008 with GetRoomRate + success, one failure), 1 unanswered attempt.
const fixtures = (): SeraVoiceCallRow[] => [
  row({
    conversation_id: 'conv_a',
    status: 'done',
    archive_state: 'final',
    started_at: '2026-09-18T06:00:00+00:00', // 10:00 Dubai
    call_date: '2026-09-18',
    duration_secs: 120,
    cost_credits: 800,
    cost_usd: 0.2,
    call_successful: 'success',
    tools_used: ['GetRoomRate'],
    is_answered: true,
    transferred_to: '8008',
    room_rate_quoted: true,
    qms_request: false,
  }),
  row({
    conversation_id: 'conv_b',
    status: 'done',
    archive_state: 'final',
    started_at: '2026-09-19T08:15:00+00:00', // 12:15 Dubai
    call_date: '2026-09-19',
    duration_secs: 60,
    cost_credits: 400,
    cost_usd: 0.1,
    call_successful: 'failure',
    tools_used: [],
    is_answered: true,
    room_rate_quoted: false,
    qms_request: false,
  }),
  row({
    conversation_id: 'conv_c',
    status: 'initiated',
    archive_state: 'unanswered',
    started_at: '2026-09-19T09:00:00+00:00',
    call_date: '2026-09-19',
    duration_secs: 0,
    is_answered: false,
  }),
];

const walkNumbers = (value: unknown, path: string, onNumber: (n: number, at: string) => void): void => {
  if (typeof value === 'number') return onNumber(value, path);
  if (Array.isArray(value)) return value.forEach((v, i) => walkNumbers(v, `${path}[${i}]`, onNumber));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) walkNumbers(v, `${path}.${k}`, onNumber);
  }
};

test('SERA_VOICE_LIST_COLUMNS is the exact select list (28 columns, no spaces, no duplicates)', () => {
  const cols = SERA_VOICE_LIST_COLUMNS.split(',');
  assert.equal(cols.length, 28);
  assert.equal(new Set(cols).size, cols.length);
  assert.ok(cols.every((c) => /^[a-z_]+$/.test(c)), 'every column is a bare snake_case identifier');
  assert.ok(cols.includes('conversation_id') && cols.includes('is_answered') && cols.includes('version_id'));
  // The Row type is derived from the same list, so this fixture compiling proves the two agree.
  assert.equal(Object.keys(nulls()).length, 28);
});

test('KPIs over 3 rows: 2 answered, 1 unanswered', () => {
  const { kpis, rows } = aggregateSeraVoice(fixtures(), FROM, TO);
  assert.equal(kpis.answered, 2);
  assert.equal(kpis.unanswered, 1);
  assert.equal(kpis.totalMinutes, 3); // 180 s
  assert.equal(kpis.avgDurationSecs, 90);
  assert.equal(kpis.credits, 1200);
  assert.equal(kpis.costUsd, 0.3);
  assert.equal(kpis.costPerMinuteUsd, 0.1);
  assert.equal(kpis.successRatePct, 50);
  assert.equal(kpis.transfers, 1);
  assert.equal(kpis.rateQuotes, 1);
  assert.equal(kpis.qmsRequests, 0);
  // rows keeps answered + unanswered, newest first
  assert.deepEqual(
    rows.map((r) => r.conversation_id),
    ['conv_c', 'conv_b', 'conv_a']
  );
});

test('byHour buckets by the Dubai hour: 21:30 UTC lands in hour 1, not 21', () => {
  const late = row({
    conversation_id: 'conv_late',
    status: 'done',
    started_at: '2026-09-18T21:30:00+00:00',
    call_date: '2026-09-19',
    duration_secs: 30,
    is_answered: true,
  });
  const { byHour } = aggregateSeraVoice([late], FROM, TO);
  assert.equal(byHour.length, 24);
  assert.deepEqual(
    byHour.map((b) => b.hour),
    Array.from({ length: 24 }, (_, i) => i)
  );
  assert.equal(byHour[1].value, 1);
  assert.equal(byHour[21].value, 0);
  assert.equal(byHour.reduce((s, b) => s + b.value, 0), 1);
  assert.equal(byHour[1].label, '01');
});

test('callsPerDay / minutesPerDay have one entry per day of the range (answered only)', () => {
  const { callsPerDay, minutesPerDay } = aggregateSeraVoice(fixtures(), FROM, TO);
  assert.deepEqual(
    callsPerDay.map((d) => d.date),
    ['2026-09-17', '2026-09-18', '2026-09-19']
  );
  assert.deepEqual(
    callsPerDay.map((d) => d.value),
    [0, 1, 1] // the unanswered attempt on the 19th is not counted
  );
  assert.deepEqual(
    minutesPerDay.map((d) => d.date),
    ['2026-09-17', '2026-09-18', '2026-09-19']
  );
  assert.deepEqual(
    minutesPerDay.map((d) => d.value),
    [0, 2, 1]
  );
  assert.ok(callsPerDay.every((d) => typeof d.label === 'string' && d.label.length > 0));
});

test('outcomeSplit and toolUsage', () => {
  const { outcomeSplit, toolUsage } = aggregateSeraVoice(fixtures(), FROM, TO);
  assert.deepEqual(
    [...outcomeSplit].sort((a, b) => a.name.localeCompare(b.name)),
    [
      { name: 'failure', value: 1 },
      { name: 'success', value: 1 },
    ]
  );
  assert.deepEqual(toolUsage, [{ name: 'GetRoomRate', value: 1 }]);
});

test('a call counts once per tool even if tools_used repeats a name; blanks are ignored', () => {
  const r = row({
    status: 'done',
    started_at: '2026-09-18T06:00:00+00:00',
    call_date: '2026-09-18',
    duration_secs: 10,
    is_answered: true,
    tools_used: ['GetRoomRate', 'GetRoomRate', 'Webhook-2S_Communication', ''],
  });
  const { toolUsage } = aggregateSeraVoice([r], FROM, TO);
  assert.deepEqual(toolUsage, [
    { name: 'GetRoomRate', value: 1 },
    { name: 'Webhook-2S_Communication', value: 1 },
  ]);
});

test('transfersByExtension labels known extensions and passes others through', () => {
  const base = { status: 'done', started_at: '2026-09-18T06:00:00+00:00', call_date: '2026-09-18', duration_secs: 10, is_answered: true };
  const { transfersByExtension, kpis } = aggregateSeraVoice(
    [
      row({ ...base, conversation_id: 'a', transferred_to: '8008' }),
      row({ ...base, conversation_id: 'b', transferred_to: '8008' }),
      row({ ...base, conversation_id: 'c', transferred_to: '8013' }),
      row({ ...base, conversation_id: 'd', transferred_to: '8100' }),
      row({ ...base, conversation_id: 'e', transferred_to: null }),
    ],
    FROM,
    TO
  );
  assert.deepEqual(transfersByExtension, [
    { name: 'Reservations (8008)', value: 2 },
    { name: 'Reception (8013)', value: 1 },
    { name: '8100', value: 1 },
  ]);
  assert.equal(kpis.transfers, 4);
});

test('unknown / missing call_successful is reported as "unknown" (lowercase, per contract)', () => {
  const base = { status: 'done', started_at: '2026-09-18T06:00:00+00:00', call_date: '2026-09-18', duration_secs: 10, is_answered: true };
  const { outcomeSplit, kpis } = aggregateSeraVoice(
    [row({ ...base, call_successful: null }), row({ ...base, call_successful: 'weird' })],
    FROM,
    TO
  );
  assert.deepEqual(outcomeSplit, [{ name: 'unknown', value: 2 }]);
  assert.equal(kpis.successRatePct, 0);
});

test('garbage rows (all nulls) give zero KPIs and no NaN anywhere in the result', () => {
  const result = aggregateSeraVoice([nulls(), nulls(), nulls()], FROM, TO);
  assert.deepEqual(result.kpis, {
    answered: 0,
    unanswered: 3,
    totalMinutes: 0,
    avgDurationSecs: 0,
    credits: 0,
    costUsd: 0,
    costPerMinuteUsd: 0,
    successRatePct: 0,
    transfers: 0,
    rateQuotes: 0,
    qmsRequests: 0,
  });
  assert.equal(result.rows.length, 3);
  assert.equal(result.byHour.length, 24);
  assert.equal(result.callsPerDay.length, 3);
  assert.deepEqual(result.outcomeSplit, []);
  assert.deepEqual(result.toolUsage, []);
  assert.deepEqual(result.transfersByExtension, []);
  const bad: string[] = [];
  walkNumbers(result, 'result', (n, at) => {
    if (!Number.isFinite(n)) bad.push(at);
  });
  assert.deepEqual(bad, [], 'every number in the result is finite');
});

test('empty input and an answered row with null numbers never produce NaN', () => {
  const empty = aggregateSeraVoice([], FROM, TO);
  assert.equal(empty.kpis.answered, 0);
  assert.equal(empty.kpis.costPerMinuteUsd, 0);
  assert.equal(empty.rows.length, 0);

  // answered but every numeric field null: minutes 0 → cost/min must be 0, avg 0, not NaN/Infinity
  const weird = aggregateSeraVoice([row({ is_answered: true, call_date: '2026-09-18', started_at: 'not-a-date' })], FROM, TO);
  const bad: string[] = [];
  walkNumbers(weird, 'weird', (n, at) => {
    if (!Number.isFinite(n)) bad.push(at);
  });
  assert.deepEqual(bad, []);
  assert.equal(weird.kpis.answered, 1);
  assert.equal(weird.kpis.avgDurationSecs, 0);
  assert.equal(weird.kpis.costPerMinuteUsd, 0);
  assert.equal(weird.byHour.reduce((s, b) => s + b.value, 0), 0); // unparseable started_at is skipped
});
