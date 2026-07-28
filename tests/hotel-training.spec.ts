import { expect, test, type Page } from '@playwright/test';
import {
  mockColleaguesFunction,
  mockColumnsFunction,
  mockManageColleagueFunction,
  mockSubmitFunction,
  mockSupabaseRest,
  mockTrainersFunction,
  setMockAuthSession,
} from './helpers/hotel-training-mocks';

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
  } = {},
) {
  await setMockAuthSession(page, email);
  await mockColleaguesFunction(page);
  await mockColumnsFunction(page);
  await mockTrainersFunction(page, { failure: opts.trainersFailure });
  await mockSubmitFunction(page, { onBody: opts.onSubmitBody });
  await mockManageColleagueFunction(page);
  await mockSupabaseRest(page, { trainingSessionFailure: opts.supabaseFailure });
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
});
