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
    onManageBody?: (body: unknown) => void;
  } = {},
) {
  await setMockAuthSession(page, email);
  await mockColleaguesFunction(page);
  await mockColumnsFunction(page);
  await mockTrainersFunction(page, { failure: opts.trainersFailure });
  await mockSubmitFunction(page, { onBody: opts.onSubmitBody });
  await mockManageColleagueFunction(page, { onBody: opts.onManageBody });
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

  test('total participants above 15 is blocked with an error message', async ({ page }) => {
    await openHotelTraining(page);
    await fillTrainingDetails(page, 16, 'Participant Cap Test');
    await page.getByRole('button', { name: /Next: Add Participants/ }).click();

    await expect(page.getByText('Maximum 15 participants per training')).toBeVisible();
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
