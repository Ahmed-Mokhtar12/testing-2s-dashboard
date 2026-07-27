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

// The sp-read-columns Edge Function returns the flattened ListColumnsResult
// shape (not the raw Graph { value: [...] } shape).
export const MOCK_COLUMNS_FLAT = {
  departments: ['Engineering', 'Finance', 'Front Office', 'Human Resources'],
  trainers: ['Ahmed Mokhtar', 'Amir Monir'],
  locationTypeAsString: 'Number',
  remarksTypeAsString: 'Number',
};

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

export async function mockSubmitFunction(page: Page) {
  await page.route(
    `https://${PROJECT_REF}.supabase.co/functions/v1/sp-submit-training`,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 200, body: 'ok' });
      }
      return route.fulfill({ json: { sharepointId: MOCK_SP_SESSION_ID, failedParticipants: [] } });
    },
  );
}

export async function mockManageColleagueFunction(page: Page) {
  await page.route(
    `https://${PROJECT_REF}.supabase.co/functions/v1/sp-manage-colleague`,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 200, body: 'ok' });
      }
      const body = route.request().postDataJSON() as { action?: string };
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
  opts: { failure?: boolean } = {},
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
      return route.fulfill({ json: MOCK_COLLEAGUES_FLAT });
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
