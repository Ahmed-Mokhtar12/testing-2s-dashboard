import type { Page } from '@playwright/test';

export const MOCK_SP_SESSION_ID = 'sp-item-001';

// The sp-read-colleagues Edge Function returns already-flattened Colleague
// objects (not the raw Graph `{ value: [{ fields }] }` shape).
export const MOCK_COLLEAGUES_FLAT = [
  { id: 'col-1', employeeId: '1001', colleagueName: 'Alice Smith', position: 'Supervisor', section: 'Reception Hotel', department: 'Front Office', isActive: true },
  { id: 'col-2', employeeId: '1002', colleagueName: 'Bob Jones', position: 'Manager', section: 'Engineering', department: 'Engineering', isActive: true },
  { id: 'col-3', employeeId: '1003', colleagueName: 'Carol White', position: 'Coordinator', section: 'Finance', department: 'Finance', isActive: true },
  { id: 'col-4', employeeId: '1004', colleagueName: 'Dave Black', position: 'Staff', section: 'Security', department: 'Security', isActive: false },
];

// A larger, all-active colleague roster used ONLY by full-viewport.spec.ts's
// 15-participant Hotel Training test (see I5 in the fix-wave-b review): the
// wizard blocks duplicate participants, so filling all 15 rows needs 15
// distinct active colleagues, and MOCK_COLLEAGUES_FLAT only has 3. This is
// deliberately a SEPARATE list rather than an extension of
// MOCK_COLLEAGUES_FLAT — appending to the shared fixture was tried first and
// made tests/hotel-training.spec.ts flaky (the participant Popover's close
// animation can leave its previous content mounted for a moment, and a
// longer option list widened that race enough to occasionally produce two
// DOM matches for the same name — reproduced locally). Keeping the two
// fixtures independent means this test's data has zero effect on the
// existing 15-test wizard suite.
export const MOCK_COLLEAGUES_MANY = [
  ...MOCK_COLLEAGUES_FLAT,
  { id: 'col-5', employeeId: '2001', colleagueName: 'Eve Turner', position: 'Staff', section: 'Front Office', department: 'Front Office', isActive: true },
  { id: 'col-6', employeeId: '2002', colleagueName: 'Frank Ng', position: 'Staff', section: 'Engineering', department: 'Engineering', isActive: true },
  { id: 'col-7', employeeId: '2003', colleagueName: 'Grace Kim', position: 'Staff', section: 'Finance', department: 'Finance', isActive: true },
  { id: 'col-8', employeeId: '2004', colleagueName: 'Hassan Ali', position: 'Staff', section: 'Front Office', department: 'Front Office', isActive: true },
  { id: 'col-9', employeeId: '2005', colleagueName: 'Isla Brown', position: 'Staff', section: 'Human Resources', department: 'Human Resources', isActive: true },
  { id: 'col-10', employeeId: '2006', colleagueName: 'Jack Lee', position: 'Staff', section: 'Engineering', department: 'Engineering', isActive: true },
  { id: 'col-11', employeeId: '2007', colleagueName: 'Karim Saleh', position: 'Staff', section: 'Front Office', department: 'Front Office', isActive: true },
  { id: 'col-12', employeeId: '2008', colleagueName: 'Layla Farouk', position: 'Staff', section: 'Finance', department: 'Finance', isActive: true },
  { id: 'col-13', employeeId: '2009', colleagueName: 'Mona Iqbal', position: 'Staff', section: 'Human Resources', department: 'Human Resources', isActive: true },
  { id: 'col-14', employeeId: '2010', colleagueName: 'Noah Becker', position: 'Staff', section: 'Engineering', department: 'Engineering', isActive: true },
  { id: 'col-15', employeeId: '2011', colleagueName: 'Omar Rahim', position: 'Staff', section: 'Front Office', department: 'Front Office', isActive: true },
  { id: 'col-16', employeeId: '2012', colleagueName: 'Priya Nair', position: 'Staff', section: 'Finance', department: 'Finance', isActive: true },
  { id: 'col-17', employeeId: '2013', colleagueName: 'Quinn Ortiz', position: 'Staff', section: 'Human Resources', department: 'Human Resources', isActive: true },
  { id: 'col-18', employeeId: '2014', colleagueName: 'Rania Saeed', position: 'Staff', section: 'Engineering', department: 'Engineering', isActive: true },
  { id: 'col-19', employeeId: '2015', colleagueName: 'Samuel Osei', position: 'Staff', section: 'Front Office', department: 'Front Office', isActive: true },
];

// The sp-read-columns Edge Function returns the flattened ListColumnsResult
// shape (not the raw Graph { value: [...] } shape).
export const MOCK_COLUMNS_FLAT = {
  departments: ['Engineering', 'Finance', 'Front Office', 'Human Resources'],
  locationTypeAsString: 'Text',
  remarksTypeAsString: 'Text',
};

// The sp-read-trainers Edge Function returns the whole enabled directory as
// TrainerRef objects, sorted by displayName. Directory entries carry full
// display names (unlike the short-name fallback constants), and include a
// person who exists only in the directory.
export const MOCK_TRAINERS_FLAT = [
  { displayName: 'Ahmed Mokhtar Elsayed Elaktaa', email: 'ahmed.mokhtar@2seasonshotels.com' },
  { displayName: 'Amir Monir Aziz', email: 'amir.monir@2seasonshotels.com' },
  { displayName: 'Sara Directory-Only', email: 'sara.new@2seasonshotels.com' },
];

export async function mockTrainersFunction(
  page: Page,
  opts: { failure?: boolean } = {},
) {
  await page.route(
    `https://${PROJECT_REF}.supabase.co/functions/v1/sp-read-trainers`,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 200, body: 'ok' });
      }
      if (opts.failure) {
        return route.fulfill({ status: 500, json: { error: 'Graph request failed.' } });
      }
      return route.fulfill({ json: MOCK_TRAINERS_FLAT });
    },
  );
}

export async function mockColumnsFunction(page: Page) {
  await page.route(
    `https://${PROJECT_REF}.supabase.co/functions/v1/sp-read-columns`,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 200, body: 'ok' });
      }
      return route.fulfill({ json: MOCK_COLUMNS_FLAT });
    },
  );
}

export async function mockSubmitFunction(
  page: Page,
  opts: { onBody?: (body: unknown) => void } = {},
) {
  await page.route(
    `https://${PROJECT_REF}.supabase.co/functions/v1/sp-submit-training`,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 200, body: 'ok' });
      }
      opts.onBody?.(route.request().postDataJSON());
      return route.fulfill({ json: { sharepointId: MOCK_SP_SESSION_ID, failedParticipants: [] } });
    },
  );
}

export async function mockManageColleagueFunction(
  page: Page,
  opts: { onBody?: (body: unknown) => void } = {},
) {
  await page.route(
    `https://${PROJECT_REF}.supabase.co/functions/v1/sp-manage-colleague`,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 200, body: 'ok' });
      }
      const body = route.request().postDataJSON() as { action?: string };
      opts.onBody?.(body);
      if (body?.action === 'add') {
        return route.fulfill({ json: { id: 'col-new' } });
      }
      return route.fulfill({ json: { ok: true } });
    },
  );
}

const PROJECT_REF = 'yczcebfaqerlwfalrbjn';
const AUTH_KEY = `sb-${PROJECT_REF}-auth-token`;

// Colleagues are now read via the sp-read-colleagues Edge Function (application
// credentials, server-side) rather than a direct browser Graph call. Mock it.
export async function mockColleaguesFunction(
  page: Page,
  opts: { failure?: boolean; list?: typeof MOCK_COLLEAGUES_FLAT } = {},
) {
  await page.route(
    `https://${PROJECT_REF}.supabase.co/functions/v1/sp-read-colleagues`,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 200, body: 'ok' });
      }
      if (opts.failure) {
        return route.fulfill({
          status: 503,
          json: { error: 'Missing Azure credentials: set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET as Supabase secrets.' },
        });
      }
      return route.fulfill({ json: opts.list ?? MOCK_COLLEAGUES_FLAT });
    },
  );
}

export async function mockSupabaseRest(page: Page, opts: { trainingSessionFailure?: boolean } = {}) {
  await page.route(`https://${PROJECT_REF}.supabase.co/rest/v1/**`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (opts.trainingSessionFailure && url.includes('/training_sessions') && method === 'POST') {
      return route.fulfill({ status: 500, json: { message: 'DB error' } });
    }

    return route.fulfill({ json: [] });
  });
}

export async function setMockAuthSession(page: Page, email = 'user@2seasonshotels.com') {
  const now = Math.floor(Date.now() / 1000);
  const fakeSession = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: 'bearer',
    user: {
      id: 'mock-user-id',
      email,
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_metadata: { first_name: 'Test' },
      app_metadata: { provider: 'azure' },
    },
  };

  await page.addInitScript(
    ({ authKey, session }) => {
      window.localStorage.setItem(authKey, JSON.stringify(session));
    },
    { authKey: AUTH_KEY, session: fakeSession },
  );
}
