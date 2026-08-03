import { expect, test, type Page } from '@playwright/test';
import {
  mockColleaguesFunction,
  mockColumnsFunction,
  mockManageColleagueFunction,
  mockSubmitFunction,
  mockSupabaseRest,
  setMockAuthSession,
  mirrorRow,
  MOCK_SP_SESSION_ID,
  PROJECT_REF,
  MOCK_COLLEAGUES_FLAT,
  MOCK_COLUMNS_FLAT,
  TRAINER_COLLEAGUE,
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
    onSubmitBody?: (body: unknown) => void;
    onManageBody?: (body: unknown) => void;
    failRowNos?: number[];
    onWrite?: (write: CapturedWrite) => void;
  } = {},
) {
  await setMockAuthSession(page, email);
  await mockColleaguesFunction(page);
  await mockColumnsFunction(page);
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

  await selectTrainer(page, TRAINER_COLLEAGUE.colleagueName);
}

// Opens the trainer picker by clicking the CHEVRON END of the trigger rather than its
// centre. The selected trainers render as badges inside the trigger, so the centre is
// whatever badge happens to be there — and a badge carries a remove control. Only the X
// removes now (TrainerPicker.tsx), so a centre click is harmless, but it is a coin flip
// whether it lands on the X of a badge or on its text, and a suite that flips a coin is
// worse than no suite. The chevron is always at the trailing edge.
async function openTrainerPicker(page: Page) {
  const trigger = page.getByTestId('trainer-select');
  const box = await trigger.boundingBox();
  if (!box) throw new Error('trainer-select has no bounding box');
  await trigger.click({ position: { x: box.width - 12, y: box.height / 2 } });
  await expect(page.getByPlaceholder('Type name or ID...')).toBeVisible();
}

// The trainer field is the participant picker, so this drives it the same way
// selectParticipant does — by name, from the colleague list. TRAINER_COLLEAGUE exists in
// the fixture solely for this: trainers and participants are mutually exclusive now, and
// three tests fill three participant rows out of the fixture's other three active
// colleagues.
async function selectTrainer(page: Page, name: string) {
  await openTrainerPicker(page);
  await page.getByRole('option', { name: new RegExp(name) }).click();
  // The picker is multi-select and stays open after a choice, by design.
  await page.keyboard.press('Escape');
  // WAIT FOR THE POPOVER TO ACTUALLY GO. Radix animates the close, so its content stays
  // mounted for a moment after Escape; re-opening inside that window made a following
  // `getByRole('option')` resolve to the closing copy and then fail with "element was
  // detached from the DOM". Same race the fixture file records for the participant
  // popover. The search input is unique to the open popover, so its absence is the
  // signal — and waiting on it here is what makes every caller safe rather than each
  // one remembering.
  await expect(page.getByPlaceholder('Type name or ID...')).toHaveCount(0);
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
    const writes: CapturedWrite[] = [];
    await openHotelTraining(page, USER_EMAIL, {
      onSubmitBody: (body) => {
        submitBodies.push(body as Record<string, unknown>);
      },
      onWrite: (write) => writes.push(write),
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

    // THE WIRE SHAPE. Plain ColleagueName text under the new field name, and neither
    // legacy field present — `trainers` was the TrainerRef array and `trainerNames`
    // still exists on the edge function with incompatible semantics (it 400s anything
    // outside a hardcoded map), so sending either would route this into the old
    // LookupId path or fail outright.
    expect(submitBodies).toHaveLength(1);
    expect(submitBodies[0].trainerColleagueNames).toEqual([TRAINER_COLLEAGUE.colleagueName]);
    expect(submitBodies[0]).not.toHaveProperty('trainers');
    expect(submitBodies[0]).not.toHaveProperty('trainerNames');

    // And the same array reaches Postgres. One local, both destinations — the two
    // stores disagreeing about who trained is the defect the client-side write exists
    // to prevent, and the monthly report reads this copy.
    const sessionWrite = writes.find((write) => write.table.startsWith('training_sessions') && write.method === 'POST');
    expect(sessionWrite?.body).toMatchObject({ trainer_names: [TRAINER_COLLEAGUE.colleagueName] });
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

  // THE TEST THAT WOULD HAVE CAUGHT THE ColleagueAccount GATE. Two withdrawn designs
  // filtered the trainer list by whether the person had a linked Microsoft account, and
  // both looked correct in a UI whose fixture happened to be all account-holders. The
  // requirement is that ANY active colleague can train, so this asserts the list is the
  // colleague list — every active row, nothing added, nothing filtered but isActive.
  test('trainer dropdown offers every active colleague, searchable by name and by ID', async ({ page }) => {
    await openHotelTraining(page);
    await openTrainerPicker(page);

    // Derived from the fixture, not written out: a literal list here would silently
    // stop covering a colleague the moment one was added
    // (docs/testing-lessons.md section 4).
    const active = MOCK_COLLEAGUES_FLAT.filter((colleague) => colleague.isActive);
    const inactive = MOCK_COLLEAGUES_FLAT.filter((colleague) => !colleague.isActive);
    expect(active.length, 'the fixture must have several active colleagues').toBeGreaterThan(2);
    expect(inactive.length, 'and at least one inactive, or the exclusion below is vacuous').toBeGreaterThan(0);

    for (const colleague of active) {
      await expect(
        page.getByRole('option', { name: new RegExp(colleague.colleagueName) }),
        `${colleague.colleagueName} must be offered as a trainer`,
      ).toBeVisible();
    }
    for (const colleague of inactive) {
      await expect(page.getByRole('option', { name: new RegExp(colleague.colleagueName) })).toHaveCount(0);
    }

    // Search by name, then by employee ID — the participant picker's behaviour, which is
    // the stated requirement rather than a nicety. Both go through filterColleagues.
    await page.getByPlaceholder('Type name or ID...').fill('Tariq');
    await expect(page.getByRole('option', { name: /Tariq Rashed/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Alice Smith/ })).toHaveCount(0);

    await page.getByPlaceholder('Type name or ID...').fill(TRAINER_COLLEAGUE.employeeId);
    await expect(page.getByRole('option', { name: /Tariq Rashed/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Alice Smith/ })).toHaveCount(0);
  });

  // EXCLUSION, CASE 1: trainer -> absent from every participant dropdown.
  test('a colleague chosen as trainer is offered in no participant row', async ({ page }) => {
    await openHotelTraining(page);
    await goToParticipants(page, 2, 'Trainer Excluded From Rows');

    for (const rowNo of [1, 2]) {
      await page.getByTestId(`participant-select-${rowNo}`).click();
      // Wait for the popover to be open before asserting absence — toHaveCount(0)
      // passes vacuously against a closed dropdown.
      await expect(page.getByRole('option', { name: /Alice Smith/ })).toBeVisible();
      await expect(
        page.getByRole('option', { name: new RegExp(TRAINER_COLLEAGUE.colleagueName) }),
        `row ${rowNo} still offers the trainer`,
      ).toHaveCount(0);
      await page.keyboard.press('Escape');
    }

    // And the step says so, rather than leaving the absence to be discovered.
    await expect(page.getByText(new RegExp(`The trainer \\(${TRAINER_COLLEAGUE.colleagueName}\\)`))).toBeVisible();
  });

  // EXCLUSION, CASE 2: participant -> absent from the trainer dropdown.
  test('a colleague chosen as a participant is not offered as a trainer', async ({ page }) => {
    await openHotelTraining(page);
    await goToParticipants(page, 1, 'Participant Excluded From Trainers');
    await selectParticipant(page, 1, 'Alice Smith');

    await page.getByRole('button', { name: 'Back' }).click();
    await openTrainerPicker(page);

    await expect(page.getByRole('option', { name: /Bob Jones/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Alice Smith/ })).toHaveCount(0);
    // The control still shows what it already holds — `keep` beating `exclude`. Without
    // it a filled field would look empty in its own dropdown.
    await expect(page.getByRole('option', { name: new RegExp(TRAINER_COLLEAGUE.colleagueName) })).toBeVisible();
  });

  // EXCLUSION, CASE 3: deselecting a trainer returns them to the participant list.
  test('deselecting a trainer makes them available as a participant again', async ({ page }) => {
    await openHotelTraining(page);
    await fillTrainingDetails(page, 1, 'Trainer Released');

    // Swap the trainer: add Bob, then toggle Tariq back off in the picker. Tariq must
    // return to the participant list and Bob must leave it — the exclusion is derived on
    // every render, not a set that is added to and never subtracted from.
    await selectTrainer(page, 'Bob Jones');
    await expect(page.getByTestId('trainer-select')).toContainText('Bob Jones');
    await openTrainerPicker(page);
    await page.getByRole('option', { name: new RegExp(TRAINER_COLLEAGUE.colleagueName) }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('trainer-select')).not.toContainText(TRAINER_COLLEAGUE.colleagueName);
    await expect(page.getByTestId('trainer-select')).toContainText('Bob Jones');

    await page.getByRole('button', { name: /Next: Add Participants/ }).click();
    await page.getByTestId('participant-select-1').click();
    await expect(page.getByRole('option', { name: new RegExp(TRAINER_COLLEAGUE.colleagueName) })).toBeVisible();
    await expect(page.getByRole('option', { name: /Bob Jones/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // The badge's X is the other way to drop a trainer, and a different code path from
    // the option toggle. It is the X specifically — clicking a badge's TEXT must open the
    // list, because the badges sit inside the trigger and used to make most of it a
    // delete button.
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByText('Bob Jones', { exact: true }).click();
    await expect(page.getByPlaceholder('Type name or ID...'), 'a badge\'s text must OPEN the picker').toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder('Type name or ID...')).toHaveCount(0);

    await page.getByTestId('remove-trainer-1002').click();
    await expect(page.getByTestId('trainer-select')).toContainText('Select trainers...');
  });

  // EXCLUSION, CASE 4: a draft holding one colleague on BOTH sides.
  test('a draft with the same colleague as trainer and participant is reconciled and still submittable', async ({ page }) => {
    const conflicted = {
      trainingDetails: {
        title: 'Conflicted Draft',
        department: 'Engineering',
        durationMinutes: 60,
        totalParticipants: 2,
        date: '2026-08-15T00:00:00.000Z',
        hour: 9,
        minute: 0,
        trainers: [TRAINER_COLLEAGUE],
      },
      participants: [
        { rowNo: 1, colleague: MOCK_COLLEAGUES_FLAT[0] },
        { rowNo: 2, colleague: TRAINER_COLLEAGUE },
      ],
      step: 1,
      savedAt: new Date().toISOString(),
    };
    await page.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, value);
      },
      { key: `hotel-training-draft-${USER_EMAIL}`, value: JSON.stringify(conflicted) },
    );

    await openHotelTraining(page);
    await expect(page.getByText(/You have an unsaved draft from/)).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Restore' }).click();

    await expect(page.getByLabel('Training Title')).toHaveValue('Conflicted Draft');
    // The TRAINER wins, and the notice names the row that was cleared.
    await expect(page.getByTestId('trainer-select')).toContainText(TRAINER_COLLEAGUE.colleagueName);
    await expect(page.getByText(/cannot be a trainer and a participant/)).toBeVisible();
    await expect(page.getByText(/row 2 \(Tariq Rashed\)/)).toBeVisible();

    // Cleared, NOT spliced: two rows still exist, and row 2 is the empty one.
    await page.getByRole('button', { name: /Next: Add Participants/ }).click();
    await expect(page.getByTestId(/^participant-select-\d+$/)).toHaveCount(2);
    await expect(page.getByTestId('participant-select-1')).toContainText('Alice Smith');
    await expect(page.getByTestId('participant-select-2')).toContainText('Search by name or Employee ID...');

    // And the form is still submittable once the cleared row is filled — the point of
    // clearing a row rather than dropping the trainer.
    await selectParticipant(page, 2, 'Bob Jones');
    await page.getByRole('button', { name: /Next: Review/ }).click();
    await page.getByRole('button', { name: 'Confirm & Submit' }).last().click();
    await expect(page.getByText('Training submitted successfully.')).toBeVisible({ timeout: 10_000 });
  });

  test('a draft holding trainers in the retired shape drops them and says so', async ({ page }) => {
    // Replaces the old "legacy draft restores to a trainer badge" test. There is nothing
    // to restore a bare name TO any more: mapping "Ahmed Mokhtar" onto a colleague means
    // guessing which of ~335 people it is, and this tenant refutes name matching
    // outright — "Amir Monir" is "Amir Gerges Daoud" in Colleagues_Master. So the entry
    // is dropped, named, and the user is asked to pick again.
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
      { key: `hotel-training-draft-${USER_EMAIL}`, value: JSON.stringify(legacyDraft) },
    );

    await openHotelTraining(page);
    await expect(page.getByText(/You have an unsaved draft from/)).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Restore' }).click();

    // The rest of the draft survives — only the trainers were unreadable.
    await expect(page.getByLabel('Training Title')).toHaveValue('Legacy Draft Training');
    await expect(page.getByText(/"Ahmed Mokhtar"/)).toBeVisible();
    await expect(page.getByText(/please select them again/i)).toBeVisible();
    await expect(page.getByTestId('trainer-select')).toContainText('Select trainers...');

    // Next is blocked until a trainer is chosen, and the notice is what explains why.
    await page.getByRole('button', { name: /Next: Add Participants/ }).click();
    await expect(page.getByText('At least one trainer is required')).toBeVisible();

    // The notice is dismissible and does not come back.
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByText(/"Ahmed Mokhtar"/)).toHaveCount(0);
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

  // PERFORMANCE REGRESSION GUARD, REWRITTEN TO THE NEW TRUTH.
  //
  // The page used to blank itself behind
  //   isLoading = colleaguesLoading || columnsLoading || trainersLoading
  // showing "Loading training data..." until the SLOWEST of three cold edge functions
  // answered — 3.5-3.8 s typically and 15.7 s once (docs/perf/hotel-training-baseline.md).
  // That gate is gone and must stay gone: this holds the reads open and asserts the form
  // is not merely PRESENT but partly USABLE long before they land.
  //
  // WHAT CHANGED, and it is a real regression rather than a test being relaxed. The old
  // version also asserted the TRAINER picker was usable with zero network, because
  // useTrainers supplied placeholderData: FALLBACK_TRAINERS. useColleagues has no
  // placeholder and cannot have one — a placeholder colleague list is a list of people
  // who do not exist, and offering three hardcoded names would offer people whose
  // Colleagues_Master spelling differs from the constant, producing a submission the
  // report cannot join. Now that trainers ARE colleagues, and zod requires at least one,
  // step 1 cannot be COMPLETED until the colleague read answers.
  //
  // So the claim is narrower and stated exactly: the shell and the constant-fed controls
  // are immediate, and the trainer picker SAYS it is waiting rather than claiming nobody
  // matches. That zod blocks Next without a trainer is proven by the retired-shape draft
  // test above; this does not re-prove it. Accepted in the spec under "Known regression".
  test('step 1 renders and is partly usable before the SharePoint reads finish', async ({ page }) => {
    // 15 s, deliberately far longer than production's worst measured 15.7 s is
    // near. The delay is never actually waited on when the test passes; making it
    // long is what gives the assertions below room to be slow on a contended host
    // WITHOUT weakening what they prove. A 5 s delay with 1 s assertion timeouts
    // was flaky here for exactly that reason — the fix is a longer delay, not a
    // looser assertion.
    const DELAY_MS = 15000;
    await setMockAuthSession(page, USER_EMAIL);
    await mockSupabaseRest(page);

    for (const fn of ['sp-read-colleagues', 'sp-read-columns']) {
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

    // ANTI-VACUITY: a rendered-but-empty form satisfies everything above. The department
    // select is populated from constants, so it must be usable while the reads are still
    // in flight — that is the surviving claim.
    //
    // EVERY assertion here is time-bounded, and that is the point. An earlier version
    // left these at the default timeout, so when placeholderData was removed the test
    // simply waited out the delay, found the real data and passed — proving nothing. A
    // generous timeout turns "renders immediately" into "renders eventually" without
    // changing a line of the assertion.
    await page.getByRole('combobox').filter({ hasText: 'Select department' }).click();
    await expect(page.getByRole('option', { name: 'Engineering' })).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');

    // The trainer picker says it is WAITING. "No active colleague found." would be the
    // same words the app uses when the directory genuinely holds nobody, and on a cold
    // start that reads as a broken list rather than a slow one.
    await openTrainerPicker(page);
    await expect(page.getByText('Loading colleagues...')).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('option')).toHaveCount(0);
    await expect(page.getByText('No active colleague found.')).toHaveCount(0);

    // The whole interaction — render, open both pickers, read their contents — must
    // finish before the reads land, or none of it happened during the wait.
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
        columns: mirrorRow(MOCK_COLUMNS_FLAT),
      },
    });

    // Not the usual mock* helpers: these record the call and then hang, so any hook that
    // falls through to the edge function cannot quietly succeed and make this test pass
    // for the wrong reason.
    //
    // sp-read-trainers stays in this list even though no mirror key feeds it and nothing
    // is meant to call it. That is the point: the function is still deployed until commit
    // 8, so this is the assertion that the retired hook is really gone rather than merely
    // unreferenced in the file someone happened to read.
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

    // ANTI-VACUITY: the shell renders with no network at all (see the guard test above),
    // so reaching step 2 proves nothing on its own. These come only from the colleagues
    // payload, and only the mirror supplied it.
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

  test('colleague load failure surfaces an error instead of empty dropdowns', async ({ page }) => {
    await setMockAuthSession(page, USER_EMAIL);
    await mockColumnsFunction(page);
    await mockSubmitFunction(page);
    await mockManageColleagueFunction(page);
    await mockColleaguesFunction(page, { failure: true });
    await mockSupabaseRest(page);
    await page.goto('/dashboard/hotel-training');

    await expect(page.getByText(/Could not load colleagues from SharePoint/i)).toBeVisible({ timeout: 15_000 });

    // The failure is now BLOCKING on step 1 — the trainer field reads this list and zod
    // requires a trainer — so the picker has to say so itself. A toast that has already
    // faded leaves a dropdown claiming nobody is active, which is a different problem
    // with a different remedy.
    await openTrainerPicker(page);
    await expect(page.getByText(/Could not load colleagues\. Reload the page/)).toBeVisible();
    await expect(page.getByText('No active colleague found.')).toHaveCount(0);
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
