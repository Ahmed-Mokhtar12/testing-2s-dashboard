import { expect, test, type Page } from '@playwright/test';
import {
  mockColleaguesFunction,
  mockColumnsFunction,
  mockManageColleagueFunction,
  mockSubmitFunction,
  mockSupabaseRest,
  mockTrainersFunction,
  setMockAuthSession,
  mirrorRow,
  mockSearchDirectoryFunction,
  MOCK_SP_SESSION_ID,
  PROJECT_REF,
  MOCK_COLLEAGUES_FLAT,
  MOCK_COLUMNS_FLAT,
  MOCK_TRAINERS_FLAT,
  type CapturedWrite,
} from './helpers/hotel-training-mocks';
// Relative, not the '@/' alias: no test in this suite uses the alias, and
// Playwright resolves its own transform rather than Vite's.
import { MAX_PARTICIPANTS } from '../src/lib/hotel-training-constants';
import { MIRROR_TTL_MS } from '../src/lib/sharepoint-mirror';

const ADMIN_EMAIL = 'ahmed.mokhtar@2seasonshotels.com';
const USER_EMAIL = 'user@2seasonshotels.com';
const FUTURE_DAY = '15';

async function openHotelTraining(
  page: Page,
  email = USER_EMAIL,
  opts: {
    supabaseFailure?: boolean;
    trainersFailure?: boolean;
    onSubmitBody?: (body: unknown) => void;
    onManageBody?: (body: unknown) => void;
    failRowNos?: number[];
    onWrite?: (write: CapturedWrite) => void;
  } = {},
) {
  await setMockAuthSession(page, email);
  await mockColleaguesFunction(page);
  await mockColumnsFunction(page);
  await mockTrainersFunction(page, { failure: opts.trainersFailure });
  await mockSubmitFunction(page, { onBody: opts.onSubmitBody, failRowNos: opts.failRowNos });
  await mockManageColleagueFunction(page, { onBody: opts.onManageBody });
  await mockSupabaseRest(page, {
    trainingSessionFailure: opts.supabaseFailure,
    onWrite: opts.onWrite,
  });
  await page.goto('/dashboard/hotel-training');
  await expect(page.getByText('Hotel Training').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Training Details' })).toBeVisible();
  await expect(page.getByText('Loading training data...')).toBeHidden();
}

async function selectByTriggerText(page: Page, triggerText: string | RegExp, optionName: string) {
  await page.getByRole('combobox').filter({ hasText: triggerText }).click();
  await page.getByRole('option', { name: optionName }).click();
}

async function fillTrainingDetails(page: Page, totalParticipants: number, title = 'Fire Safety Training') {
  await page.getByLabel('Training Title').fill(title);
  await selectByTriggerText(page, 'Select department', 'Engineering');
  await selectByTriggerText(page, 'Select duration', '1 hour');
  await page.getByLabel('Total Participants').fill(String(totalParticipants));

  await page.getByRole('button', { name: /Pick a date/ }).click();
  await page.getByRole('gridcell', { name: FUTURE_DAY, exact: true }).first().click();

  await selectByTriggerText(page, /09|Hour/, '09');
  await selectByTriggerText(page, /00|Min/, '00');

  await page.getByRole('combobox').filter({ hasText: 'Select trainers...' }).click();
  await page.getByRole('option', { name: 'Ahmed Mokhtar Elsayed Elaktaa' }).click();
  await page.keyboard.press('Escape');
}

async function goToParticipants(page: Page, totalParticipants: number, title?: string) {
  await fillTrainingDetails(page, totalParticipants, title);
  await page.getByRole('button', { name: /Next: Add Participants/ }).click();
  await expect(page.getByRole('button', { name: 'Participants' })).toBeVisible();
}

async function selectParticipant(page: Page, rowNo: number, name: string) {
  await page.getByTestId(`participant-select-${rowNo}`).click();
  await page.getByRole('option', { name: new RegExp(name) }).click({ force: true });
}

test.describe('Hotel Training', () => {
  test('happy path: submit training with 3 participants shows success screen', async ({ page }) => {
    const submitBodies: Array<Record<string, unknown>> = [];
    await openHotelTraining(page, USER_EMAIL, {
      onSubmitBody: (body) => {
        submitBodies.push(body as Record<string, unknown>);
      },
    });
    await goToParticipants(page, 3);

    await selectParticipant(page, 1, 'Alice Smith');
    await selectParticipant(page, 2, 'Bob Jones');
    await selectParticipant(page, 3, 'Carol White');

    await page.getByRole('button', { name: /Next: Review/ }).click();
    const submitButton = page.getByRole('button', { name: 'Confirm & Submit' }).last();
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    await expect(page.getByText('Training submitted successfully.')).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('hotel-training-draft-')))).toBe(false);

    // The client must send the new TrainerRef shape, not the legacy names array.
    expect(submitBodies).toHaveLength(1);
    expect(submitBodies[0].trainers).toEqual([
      { displayName: 'Ahmed Mokhtar Elsayed Elaktaa', email: 'ahmed.mokhtar@2seasonshotels.com' },
    ]);
    expect(submitBodies[0]).not.toHaveProperty('trainerNames');
  });

  test('duplicate participant is blocked by excluding already-selected employee IDs', async ({ page }) => {
    await openHotelTraining(page);
    await goToParticipants(page, 2, 'Duplicate Guard Test');

    await selectParticipant(page, 1, 'Alice Smith');
    await page.getByTestId('participant-select-2').click();

    // Wait for the dropdown to be open (another option visible) before
    // asserting absence — toHaveCount(0) would pass vacuously pre-open.
    await expect(page.getByRole('option', { name: /Bob Jones/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Alice Smith/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('option', { name: /Bob Jones/ })).toHaveCount(0);
    await page.getByRole('button', { name: /Next: Review/ }).click();
    await expect(page.getByText('Please select all participants before continuing.')).toBeVisible();
  });

  test('Manage Members tab hidden for non-admin, visible for admin', async ({ page }) => {
    await openHotelTraining(page, USER_EMAIL);
    await expect(page.getByRole('tab', { name: 'Manage Members' })).toHaveCount(0);

    await page.close();
    const adminPage = await page.context().newPage();
    await openHotelTraining(adminPage, ADMIN_EMAIL);
    await expect(adminPage.getByRole('tab', { name: 'Manage Members' })).toBeVisible();

    await adminPage.getByRole('tab', { name: 'Manage Members' }).click();
    await expect(adminPage.getByRole('tab', { name: 'Add New Member' })).toBeVisible();
    await expect(adminPage.getByRole('tab', { name: 'Edit Member' })).toBeVisible();
    await expect(adminPage.getByRole('tab', { name: 'Remove Member' })).toBeVisible();
  });

  test('draft restore banner appears after refresh and restores form', async ({ page }) => {
    await openHotelTraining(page);
    await page.getByLabel('Training Title').fill('Draft Training Title');
    await page.waitForTimeout(1_100);

    await page.reload();
    await expect(page.getByText(/You have an unsaved draft from/)).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Restore' }).click();

    await expect(page.getByLabel('Training Title')).toHaveValue('Draft Training Title');
  });

  test('reducing participants count with filled rows shows confirmation dialog', async ({ page }) => {
    await openHotelTraining(page);
    await goToParticipants(page, 3, 'Reduce Count Test');

    await selectParticipant(page, 1, 'Alice Smith');
    await selectParticipant(page, 2, 'Bob Jones');
    await selectParticipant(page, 3, 'Carol White');

    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByLabel('Total Participants').fill('2');
    await page.getByRole('button', { name: /Next: Add Participants/ }).click();

    await expect(page.getByText('Reducing participant count will remove filled entries. Continue?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByLabel('Total Participants')).toHaveValue('3');
  });

  test(`total participants above ${MAX_PARTICIPANTS} is blocked with an error message`, async ({ page }) => {
    await openHotelTraining(page);
    // Derived from the constant, not the literal 16 this test used to hold. The
    // cap moved 15 -> 100 on 2026-08-01 and a test pinning the old number would
    // have gone on passing while asserting the wrong ceiling.
    await fillTrainingDetails(page, MAX_PARTICIPANTS + 1, 'Participant Cap Test');
    await page.getByRole('button', { name: /Next: Add Participants/ }).click();

    await expect(page.getByText(`Maximum ${MAX_PARTICIPANTS} participants per training`)).toBeVisible();
    // The wizard did not advance: the details form is still shown and the
    // participants step content is not.
    await expect(page.getByLabel('Total Participants')).toBeVisible();
    await expect(page.getByText('Select a colleague for each row. Only active colleagues are shown.')).toHaveCount(0);
  });

  test('location and remarks accept free text that survives to the confirmation step', async ({ page }) => {
    const submitBodies: Array<Record<string, unknown>> = [];
    await openHotelTraining(page, USER_EMAIL, {
      onSubmitBody: (body) => {
        submitBodies.push(body as Record<string, unknown>);
      },
    });
    await fillTrainingDetails(page, 1, 'Text Columns Test');
    await page.getByLabel('Location').fill('Meeting Room 2, 3rd floor');
    await page.getByLabel('Remarks').fill('Bring the updated evacuation plan.');
    await page.getByRole('button', { name: /Next: Add Participants/ }).click();

    await selectParticipant(page, 1, 'Alice Smith');
    await page.getByRole('button', { name: /Next: Review/ }).click();

    // The typed text renders unchanged on the confirmation step.
    await expect(page.getByText('Meeting Room 2, 3rd floor')).toBeVisible();
    await expect(page.getByText('Bring the updated evacuation plan.')).toBeVisible();

    // And it is submitted as text, not coerced to numbers.
    await page.getByRole('button', { name: 'Confirm & Submit' }).last().click();
    await expect(page.getByText('Training submitted successfully.')).toBeVisible({ timeout: 10_000 });
    expect(submitBodies).toHaveLength(1);
    expect(submitBodies[0].location).toBe('Meeting Room 2, 3rd floor');
    expect(submitBodies[0].remarks).toBe('Bring the updated evacuation plan.');
  });

  test('trainer dropdown lists the live directory with search filtering', async ({ page }) => {
    // MOCK_TRAINERS_FLAT is the sp-read-trainers directory: full display names
    // plus a directory-only person. FALLBACK_TRAINERS (hardcoded) has
    // 'Xarmaigne Narciso' — if the dropdown reads the live directory, that
    // name must be absent and the directory-only person present.
    await openHotelTraining(page);
    await page.getByRole('combobox').filter({ hasText: 'Select trainers...' }).click();
    await expect(page.getByRole('option', { name: 'Sara Directory-Only' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Ahmed Mokhtar Elsayed Elaktaa' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Amir Monir Aziz' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Xarmaigne Narciso' })).toHaveCount(0);

    // Typing narrows the list.
    await page.getByPlaceholder('Search trainers...').fill('Directory');
    await expect(page.getByRole('option', { name: 'Sara Directory-Only' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Ahmed Mokhtar Elsayed Elaktaa' })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Amir Monir Aziz' })).toHaveCount(0);
  });

  test('trainer directory failure falls back to the three known trainers', async ({ page }) => {
    await openHotelTraining(page, USER_EMAIL, { trainersFailure: true });
    await page.getByRole('combobox').filter({ hasText: 'Select trainers...' }).click();
    await expect(page.getByRole('option', { name: 'Ahmed Mokhtar', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Amir Monir', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Xarmaigne Narciso' })).toBeVisible();

    // The fallback entries are actually selectable.
    await page.getByRole('option', { name: 'Xarmaigne Narciso' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('combobox').filter({ hasText: 'Xarmaigne Narciso' })).toBeVisible();
  });

  test('legacy draft with plain trainer names restores to a trainer badge', async ({ page }) => {
    const legacyDraft = {
      trainingDetails: {
        title: 'Legacy Draft Training',
        trainerNames: ['Ahmed Mokhtar'],
      },
      participants: [],
      step: 1,
      savedAt: new Date().toISOString(),
    };
    await page.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, value);
      },
      {
        key: `hotel-training-draft-${USER_EMAIL}`,
        value: JSON.stringify(legacyDraft),
      },
    );

    await openHotelTraining(page);
    await expect(page.getByText(/You have an unsaved draft from/)).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Restore' }).click();

    await expect(page.getByLabel('Training Title')).toHaveValue('Legacy Draft Training');
    // The legacy name string was migrated to a TrainerRef via FALLBACK_TRAINERS
    // and renders as a badge in the trainer combobox trigger.
    await expect(
      page.getByRole('combobox').filter({ hasText: 'Ahmed Mokhtar' }),
    ).toBeVisible();
  });

  test('Supabase sync failure shows partial success banner and clears draft', async ({ page }) => {
    await openHotelTraining(page, USER_EMAIL, { supabaseFailure: true });
    await goToParticipants(page, 1, 'Partial Sync Test');

    await selectParticipant(page, 1, 'Alice Smith');
    await page.getByRole('button', { name: /Next: Review/ }).click();
    await page.getByRole('button', { name: 'Confirm & Submit' }).last().click();

    await expect(page.getByText('Training saved to SharePoint. Dashboard sync pending.')).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('hotel-training-draft-')))).toBe(false);
  });

  // REGRESSION TEST for the defect that blocked raising the participant cap to
  // 100. A single failed SharePoint participant row used to make
  // useTrainingSubmit return BEFORE every Supabase write, so the session was not
  // recorded as 'partial' — it was absent from the database entirely, invisible
  // to the training report, with no sync-queue row to recover from. At 15 rows a
  // failure was rare enough to go unnoticed; at 100 with SharePoint throttling
  // it becomes routine.
  //
  // This asserts the three writes that used to not happen, plus the fact that
  // the failed row is EXCLUDED from the participants insert — inserting it would
  // claim someone was recorded who was not, and would make the row count agree
  // with total_participants, defeating report-aggregator's mismatch check.
  test('SharePoint partial failure still mirrors the session to the database as partial', async ({ page }) => {
    const writes: CapturedWrite[] = [];
    await openHotelTraining(page, USER_EMAIL, {
      failRowNos: [2],
      onWrite: (write) => writes.push(write),
    });
    await goToParticipants(page, 3, 'Partial SharePoint Write');

    await selectParticipant(page, 1, 'Alice Smith');
    await selectParticipant(page, 2, 'Bob Jones');
    await selectParticipant(page, 3, 'Carol White');
    await page.getByRole('button', { name: /Next: Review/ }).click();
    await page.getByRole('button', { name: 'Confirm & Submit' }).last().click();

    // The operator is told not to resubmit. "Please retry" was the old copy, and
    // following it minted a new trainingId and duplicated the SharePoint session
    // — the session list item has no TrainingID field, so the function cannot
    // dedupe a resubmission.
    await expect(page.getByText(/Do NOT submit again/)).toBeVisible({ timeout: 10_000 });

    const posts = (table: string) =>
      writes.filter((write) => write.table === table && write.method === 'POST');

    // ANTI-VACUITY: if the route interception or the URL parsing broke, every
    // filter below would return [] and the length assertions would be the only
    // thing standing between that and a green test. Assert we captured writes at
    // all first.
    expect(writes.length).toBeGreaterThan(0);

    const sessions = posts('training_sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].body).toMatchObject({
      sync_status: 'partial',
      // The DECLARED count, not the 2 rows that landed. This is what makes the
      // gap detectable downstream.
      total_participants: 3,
    });

    const participantPosts = posts('training_participants');
    expect(participantPosts).toHaveLength(1);
    const inserted = participantPosts[0].body as Array<{ row_no: number }>;
    expect(inserted.map((row) => row.row_no)).toEqual([1, 3]);

    const queued = posts('training_sync_queue');
    expect(queued).toHaveLength(1);
    expect(queued[0].body).toMatchObject({
      failure_reason: expect.stringContaining('1 of 3 participant row(s) failed'),
    });
  });

  // PERFORMANCE REGRESSION GUARD. The page used to blank itself behind
  //   isLoading = colleaguesLoading || columnsLoading || trainersLoading
  // so it showed "Loading training data..." until the SLOWEST of three cold edge
  // functions answered — measured in production at 3.5-3.8 s typically and 15.7 s
  // once (docs/perf/hotel-training-baseline.md).
  //
  // Step 1 needs no network answer: departments come from constants, the column
  // types default to 'Text', and the trainer list has a built-in fallback. This
  // holds the three reads open and asserts the form is not just PRESENT but
  // USABLE well before they land.
  test('step 1 renders and is usable before the SharePoint reads finish', async ({ page }) => {
    // 15 s, deliberately far longer than production's worst measured 15.7 s is
    // near. The delay is never actually waited on when the test passes; making it
    // long is what gives the assertions below room to be slow on a contended host
    // WITHOUT weakening what they prove. A 5 s delay with 1 s assertion timeouts
    // was flaky here for exactly that reason — the fix is a longer delay, not a
    // looser assertion.
    const DELAY_MS = 15000;
    await setMockAuthSession(page, USER_EMAIL);
    await mockSupabaseRest(page);

    for (const fn of ['sp-read-colleagues', 'sp-read-columns', 'sp-read-trainers']) {
      await page.route(`https://${PROJECT_REF}.supabase.co/functions/v1/${fn}`, async (route) => {
        if (route.request().method() === 'OPTIONS') {
          return route.fulfill({ status: 200, body: 'ok' });
        }
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        return route.fulfill({ json: fn === 'sp-read-columns' ? MOCK_COLUMNS_FLAT : [] });
      });
    }

    const started = Date.now();
    await page.goto('/dashboard/hotel-training');
    await expect(page.getByLabel('Training Title')).toBeVisible({ timeout: 8000 });

    // The old gate's text. Its absence is the change under test.
    await expect(page.getByText('Loading training data...')).toHaveCount(0);

    // ANTI-VACUITY: a rendered-but-empty form satisfies everything above. The
    // department select is populated from constants and the trainer picker from
    // FALLBACK_TRAINERS, so both must be usable while the reads are still in
    // flight — that is the actual claim.
    //
    // EVERY assertion here is time-bounded, and that is the point. An earlier
    // version left these at the default timeout, so when placeholderData was
    // removed the test simply waited out the 5 s delay, found the real data and
    // passed — proving nothing. A generous timeout turns "renders immediately"
    // into "renders eventually" without changing a line of the assertion.
    await page.getByRole('combobox').filter({ hasText: 'Select department' }).click();
    await expect(page.getByRole('option', { name: 'Engineering' })).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');

    await page.getByRole('combobox').filter({ hasText: 'Select trainers...' }).click();
    await expect(page.getByRole('option', { name: 'Ahmed Mokhtar' }).first())
      .toBeVisible({ timeout: 3000 });

    // The whole interaction — render, open both pickers, read their options —
    // must finish before the reads land, or none of it was served from fallbacks.
    const elapsed = Date.now() - started;
    expect(
      elapsed,
      `form was only usable after ${elapsed} ms; the reads land at ${DELAY_MS} ms, so this did not prove immediacy`,
    ).toBeLessThan(DELAY_MS);
  });

  // The Postgres mirror (public.sharepoint_mirror). Its whole purpose is to keep
  // the page off the three cold edge functions, so the assertion that matters is
  // not "the data appears" — it is "the edge functions were never called".
  test('a fresh mirror serves the page without invoking any sp-read function', async ({ page }) => {
    const edgeCalls: string[] = [];
    await setMockAuthSession(page, USER_EMAIL);
    await mockSubmitFunction(page);
    await mockManageColleagueFunction(page);
    await mockSupabaseRest(page, {
      mirror: {
        colleagues: mirrorRow(MOCK_COLLEAGUES_FLAT),
        trainers: mirrorRow(MOCK_TRAINERS_FLAT),
        columns: mirrorRow(MOCK_COLUMNS_FLAT),
      },
    });

    // Not the usual mock* helpers: these record the call and then hang, so any
    // hook that falls through to the edge function cannot quietly succeed and
    // make this test pass for the wrong reason.
    for (const fn of ['sp-read-colleagues', 'sp-read-columns', 'sp-read-trainers']) {
      await page.route(`https://${PROJECT_REF}.supabase.co/functions/v1/${fn}`, async (route) => {
        if (route.request().method() === 'OPTIONS') {
          return route.fulfill({ status: 200, body: 'ok' });
        }
        edgeCalls.push(fn);
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        return route.fulfill({ json: [] });
      });
    }

    await page.goto('/dashboard/hotel-training');
    await goToParticipants(page, 2, 'Served From The Mirror');

    // ANTI-VACUITY: step 1 renders from placeholderData with no network at all
    // (see the guard test above), so reaching step 2 proves nothing on its own.
    // These come only from the colleagues payload, and only the mirror supplied it.
    await page.getByTestId('participant-select-1').click();
    await expect(page.getByRole('option', { name: /Alice Smith/ })).toBeVisible({ timeout: 3000 });
    // Dave Black is isActive: false in the fixture — proof the real payload was
    // parsed rather than a placeholder list being shown.
    await expect(page.getByRole('option', { name: /Dave Black/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    expect(edgeCalls, `expected no sp-read-* call, got: ${edgeCalls.join(', ')}`).toEqual([]);
  });

  test('a stale mirror is ignored and the edge function is called instead', async ({ page }) => {
    // The other half of the rule. A mirror row older than its TTL must not be
    // served — otherwise a colleague added directly in SharePoint would stay
    // invisible indefinitely, which is the failure the TTL exists to bound.
    const staleAge = MIRROR_TTL_MS.colleagues + 60_000;
    let colleaguesInvoked = 0;
    await setMockAuthSession(page, USER_EMAIL);
    await mockColumnsFunction(page);
    await mockTrainersFunction(page);
    await mockSubmitFunction(page);
    await mockManageColleagueFunction(page);
    await mockSupabaseRest(page, {
      mirror: { colleagues: mirrorRow([{ ...MOCK_COLLEAGUES_FLAT[0], colleagueName: 'Stale Person' }], staleAge) },
    });
    await page.route(`https://${PROJECT_REF}.supabase.co/functions/v1/sp-read-colleagues`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 200, body: 'ok' });
      }
      colleaguesInvoked += 1;
      return route.fulfill({ json: MOCK_COLLEAGUES_FLAT });
    });

    await page.goto('/dashboard/hotel-training');
    await goToParticipants(page, 2, 'Stale Mirror Test');
    await page.getByTestId('participant-select-1').click();

    // The live list, not the stale row.
    await expect(page.getByRole('option', { name: /Alice Smith/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Stale Person/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(colleaguesInvoked).toBeGreaterThan(0);
  });

  // The trainer picker's escape hatch. What matters is not that the wider search
  // works — it is that the picker never invites someone to fill a 100-participant
  // form for a trainer SharePoint will refuse at the last click.
  async function openTrainerPicker(
    page: Page,
    opts: Parameters<typeof mockSearchDirectoryFunction>[1] & {
      trainers?: Array<{ displayName: string; email: string }>;
    } = {},
  ) {
    await setMockAuthSession(page, USER_EMAIL);
    await mockColleaguesFunction(page);
    await mockColumnsFunction(page);
    await mockTrainersFunction(page, opts.trainers ? { entries: opts.trainers } : {});
    await mockSubmitFunction(page);
    await mockManageColleagueFunction(page);
    await mockSupabaseRest(page);
    await mockSearchDirectoryFunction(page, opts);
    await page.goto('/dashboard/hotel-training');
    await expect(page.getByLabel('Training Title')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('combobox').filter({ hasText: 'Select trainers...' }).click();
  }

  test('the directory search is offered only once the query is long enough', async ({ page }) => {
    const searched: string[] = [];
    await openTrainerPicker(page, { onQuery: (q) => searched.push(q) });

    const offer = page.getByRole('button', { name: /Search the full Microsoft directory/ });
    await expect(offer).toHaveCount(0, { timeout: 3000 });

    await page.getByPlaceholder('Search trainers...').fill('m');
    await expect(offer).toHaveCount(0);

    await page.getByPlaceholder('Search trainers...').fill('moh');
    await expect(offer).toBeVisible();

    // ANTI-VACUITY: the offer being visible proves nothing if it fires on its own.
    // Nothing may have been searched until the row is actually clicked.
    expect(searched, 'the directory must not be searched by typing alone').toEqual([]);
  });

  // THE DEFECT THIS SUITE MISSED. Every test above opens the picker with three
  // mock trainers, so the escape hatch was always on screen — while in production,
  // against a real staff list, any query matching more than about eight people
  // pushed it out of the 300px scroll box. It shipped working and unreachable.
  test('the directory offer stays on screen when many staff match the query', async ({ page }) => {
    // Thirty matching names: far more than CommandList's max-h-[300px] can show.
    const crowd = Array.from({ length: 30 }, (_, index) => ({
      displayName: `Mohammed Staff-${String(index).padStart(2, '0')}`,
      email: `mohammed.staff${index}@2seasonshotels.com`,
    }));
    await openTrainerPicker(page, { trainers: crowd });

    await page.getByPlaceholder('Search trainers...').fill('moh');
    await expect(page.getByRole('option', { name: /Mohammed Staff-00/ })).toBeVisible();

    const offer = page.getByRole('button', { name: /Search the full Microsoft directory/ });
    // toBeVisible is NOT enough: an element scrolled out of an overflow container
    // still has a box and still passes it. toBeInViewport is clipped by ancestor
    // overflow, which is exactly the failure being guarded.
    await expect(offer).toBeInViewport();
    // And structurally, so the reason survives a future restyle: the offer must not
    // live inside the scrolling list at all.
    await expect(page.locator('[cmdk-list]').getByRole('button', {
      name: /Search the full Microsoft directory/,
    })).toHaveCount(0);
  });

  test('the picker says it reaches the directory before anything is typed', async ({ page }) => {
    // The only thing on screen that tells someone this field is more than a filter.
    // The hint that used to carry this sits under the field, which the popover covers.
    await openTrainerPicker(page);
    await expect(
      page.getByText(/Not in the list\? Type at least 2 letters/),
    ).toBeInViewport();
  });

  test('a match that is already in the trainer list says so, rather than looking broken', async ({ page }) => {
    // Sub-case A: in the site's UIL, so already selectable above. An empty result
    // area here is indistinguishable from a search that silently failed.
    await openTrainerPicker(page, {
      results: [
        {
          displayName: 'Ahmed Mokhtar Elsayed Elaktaa',
          email: 'ahmed.mokhtar@2seasonshotels.com',
          inSite: true,
        },
      ],
    });

    await page.getByPlaceholder('Search trainers...').fill('ahmed');
    await page.getByRole('button', { name: /Search the full Microsoft directory/ }).click();

    await expect(page.getByText(/already in the trainer list above/)).toBeVisible();
    // Not duplicated into the directory group.
    await expect(page.getByRole('option', { name: /Ahmed Mokhtar/ })).toHaveCount(1);
  });

  test('a directory person already on the site can be picked and reaches the payload', async ({ page }) => {
    const submitBodies: Array<Record<string, unknown>> = [];
    const searched: string[] = [];
    await openTrainerPicker(page, {
      onQuery: (q) => searched.push(q),
      results: [
        { displayName: 'Ibrahim Mohammad', email: 'ibrahim.mohammad@2seasonshotels.com', inSite: true, jobTitle: 'Chef de Partie' },
      ],
    });
    await page.route(`https://${PROJECT_REF}.supabase.co/functions/v1/sp-submit-training`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, body: 'ok' });
      submitBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({ json: { sharepointId: MOCK_SP_SESSION_ID, failedParticipants: [] } });
    });

    await page.getByPlaceholder('Search trainers...').fill('moh');
    await page.getByRole('button', { name: /Search the full Microsoft directory/ }).click();

    // The click sent the typed text, not a stale value.
    await expect.poll(() => searched).toEqual(['moh']);

    await page.getByRole('option', { name: /Ibrahim Mohammad/ }).click();
    await page.keyboard.press('Escape');
    // Scoped to the trigger: the option stays mounted while the popover animates
    // out, so an unscoped getByText matches it AND the badge and fails strict mode.
    await expect(
      page.getByRole('combobox').filter({ hasText: 'Ibrahim Mohammad' }),
    ).toBeVisible();
  });

  test('a directory person not on the site cannot be picked, and says why', async ({ page }) => {
    await openTrainerPicker(page, {
      results: [
        { displayName: 'Mohammed Rashid', email: 'mohammed.rashid@2seasonshotels.com', inSite: false },
      ],
    });

    await page.getByPlaceholder('Search trainers...').fill('moh');
    await page.getByRole('button', { name: /Search the full Microsoft directory/ }).click();

    const entry = page.getByRole('option', { name: /Mohammed Rashid/ });
    await expect(entry).toBeVisible();
    await expect(page.getByText('not on the site yet')).toBeVisible();

    // The explanation must name the remedies, and must appear WITHOUT the user
    // having filled in the rest of the form — that is the whole point.
    //
    // The row is deliberately NOT cmdk-disabled: a disabled CommandItem never fires
    // onSelect, so the reason would be unreachable. So the assertion is behavioural —
    // activating it explains itself and does NOT select.
    await entry.click();
    await expect(page.getByText(/can’t be recorded yet/)).toBeVisible();
    await expect(page.getByText(/open the site once/)).toBeVisible();
    await expect(page.getByText(/PowerApp/)).toBeVisible();

    // THE REFUSAL, which is the point: no badge, so nothing was selected.
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('combobox').filter({ hasText: 'Mohammed Rashid' }),
    ).toHaveCount(0);
    await expect(page.getByRole('combobox').filter({ hasText: 'Select trainers...' })).toBeVisible();
  });

  test('a directory search that finds nobody explains why rather than saying "no trainer found"', async ({ page }) => {
    await openTrainerPicker(page, { results: [] });

    await page.getByPlaceholder('Search trainers...').fill('zzzz');
    await page.getByRole('button', { name: /Search the full Microsoft directory/ }).click();

    // Names what was searched, and warns about tokenisation — Graph matches whole
    // words from their start, so "hammad" will not find "Mohammad". Without that
    // sentence a user concludes the person has no account.
    await expect(page.getByText(/No Microsoft account matches/)).toBeVisible();
    await expect(page.getByText(/whole words from their start/)).toBeVisible();
  });

  test('colleague load failure surfaces an error instead of empty dropdowns', async ({ page }) => {
    await setMockAuthSession(page, USER_EMAIL);
    await mockColumnsFunction(page);
    await mockTrainersFunction(page);
    await mockSubmitFunction(page);
    await mockManageColleagueFunction(page);
    await mockColleaguesFunction(page, { failure: true });
    await mockSupabaseRest(page);
    await page.goto('/dashboard/hotel-training');

    await expect(page.getByText(/Could not load colleagues from SharePoint/i)).toBeVisible({ timeout: 15_000 });
  });

  async function openEditMemberTab(page: Page) {
    await page.getByRole('tab', { name: 'Manage Members' }).click();
    await page.getByRole('tab', { name: 'Edit Member' }).click();
  }

  async function pickEditMember(page: Page, search: string, optionName: RegExp) {
    await page.getByRole('button', { name: 'Search by name or Employee ID...' }).click();
    await page.getByPlaceholder('Type name or ID...').fill(search);
    await page.getByRole('option', { name: optionName }).click();
  }

  test('edit member: promotion shows old → new confirmation and sends update patch', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    await openHotelTraining(page, ADMIN_EMAIL, { onManageBody: (b) => bodies.push(b as Record<string, unknown>) });
    await openEditMemberTab(page);
    await pickEditMember(page, 'Alice', /Alice Smith/);

    // Nothing changed yet → Save disabled.
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();

    await page.getByLabel('Position').fill('Senior Supervisor');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('Position: Supervisor → Senior Supervisor')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, save changes' }).click();
    await expect(page.getByText('Member updated successfully.')).toBeVisible();

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({
      action: 'update',
      itemId: 'col-1',
      patch: {
        colleagueName: 'Alice Smith',
        position: 'Senior Supervisor',
        section: 'Reception Hotel',
        department: 'Front Office',
      },
    });
  });

  test('edit member: department transfer forces re-selecting a valid section', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    await openHotelTraining(page, ADMIN_EMAIL, { onManageBody: (b) => bodies.push(b as Record<string, unknown>) });
    await openEditMemberTab(page);
    await pickEditMember(page, '1001', /Alice Smith/);

    await selectByTriggerText(page, 'Front Office', 'Engineering');
    // Section was cleared; saving without one is blocked.
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Section is required')).toBeVisible();

    // Only the new department's sections are offered.
    await page.getByRole('combobox').filter({ hasText: 'Select section' }).click();
    await expect(page.getByRole('option', { name: 'Engineering' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Reception Hotel' })).toHaveCount(0);
    await page.getByRole('option', { name: 'Engineering' }).click();

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.getByRole('button', { name: 'Yes, save changes' }).click();
    await expect(page.getByText('Member updated successfully.')).toBeVisible();

    expect(bodies).toHaveLength(1);
    const patch = (bodies[0] as { patch: Record<string, unknown> }).patch;
    expect(patch.department).toBe('Engineering');
    expect(patch.section).toBe('Engineering');
  });

  test('edit member: inactive member shows badge and reactivates via the switch', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    await openHotelTraining(page, ADMIN_EMAIL, { onManageBody: (b) => bodies.push(b as Record<string, unknown>) });
    await openEditMemberTab(page);

    await page.getByRole('button', { name: 'Search by name or Employee ID...' }).click();
    await page.getByPlaceholder('Type name or ID...').fill('Dave');
    await expect(page.getByRole('option', { name: /Dave Black/ }).getByText('Inactive')).toBeVisible();
    await page.getByRole('option', { name: /Dave Black/ }).click();

    // No field changes → Save still disabled until the switch is on.
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    await page.getByLabel('Reactivate this member').click();
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('Will be reactivated')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, save changes' }).click();
    await expect(page.getByText('Member updated successfully.')).toBeVisible();

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({
      action: 'update',
      itemId: 'col-4',
      patch: {
        colleagueName: 'Dave Black',
        position: 'Staff',
        section: 'Security',
        department: 'Security',
        reactivate: true,
      },
    });
  });
});
