import type { Page } from '@playwright/test';

export const MOCK_SITE_ID = 'mock-site-id,mock-web-id,mock-list-root';
export const MOCK_SP_SESSION_ID = 'sp-item-001';

export const MOCK_COLLEAGUES = [
  {
    id: 'col-1',
    fields: {
      EmployeeID: '1001',
      ColleagueName: 'Alice Smith',
      Position: 'Supervisor',
      Section: 'Reception Hotel',
      Department: { Value: 'Front Office' },
      IsActive: true,
    },
  },
  {
    id: 'col-2',
    fields: {
      EmployeeID: '1002',
      ColleagueName: 'Bob Jones',
      Position: 'Manager',
      Section: 'Engineering',
      Department: { Value: 'Engineering' },
      IsActive: true,
    },
  },
  {
    id: 'col-3',
    fields: {
      EmployeeID: '1003',
      ColleagueName: 'Carol White',
      Position: 'Coordinator',
      Section: 'Finance',
      Department: { Value: 'Finance' },
      IsActive: true,
    },
  },
  {
    id: 'col-4',
    fields: {
      EmployeeID: '1004',
      ColleagueName: 'Dave Black',
      Position: 'Staff',
      Section: 'Security',
      Department: { Value: 'Security' },
      IsActive: false,
    },
  },
];

// The sp-read-colleagues Edge Function returns already-flattened Colleague
// objects (not the raw Graph `{ value: [{ fields }] }` shape). This mirrors
// MOCK_COLLEAGUES after the function's transform, including Dave Black inactive.
export const MOCK_COLLEAGUES_FLAT = [
  { id: 'col-1', employeeId: '1001', colleagueName: 'Alice Smith', position: 'Supervisor', section: 'Reception Hotel', department: 'Front Office', isActive: true },
  { id: 'col-2', employeeId: '1002', colleagueName: 'Bob Jones', position: 'Manager', section: 'Engineering', department: 'Engineering', isActive: true },
  { id: 'col-3', employeeId: '1003', colleagueName: 'Carol White', position: 'Coordinator', section: 'Finance', department: 'Finance', isActive: true },
  { id: 'col-4', employeeId: '1004', colleagueName: 'Dave Black', position: 'Staff', section: 'Security', department: 'Security', isActive: false },
];

export const MOCK_COLUMNS = {
  value: [
    {
      name: 'field_1',
      typeAsString: 'Choice',
      choice: { choices: ['Engineering', 'Finance', 'Front Office', 'Human Resources'] },
    },
    {
      name: 'TrainerName_x002e_',
      typeAsString: 'MultiChoice',
      choice: { choices: ['Ahmed Mokhtar', 'Amir Monir'] },
    },
    { name: 'field_5', typeAsString: 'Number' },
    { name: 'field_7', typeAsString: 'Number' },
  ],
};

const PROJECT_REF = 'yczcebfaqerlwfalrbjn';
const AUTH_KEY = `sb-${PROJECT_REF}-auth-token`;

export async function mockGraphAPI(page: Page) {
  await page.route('https://graph.microsoft.com/v1.0/sites/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (!url.includes('/lists/') && method === 'GET') {
      return route.fulfill({ json: { id: MOCK_SITE_ID } });
    }

    if (url.includes('/columns') && method === 'GET') {
      return route.fulfill({ json: MOCK_COLUMNS });
    }

    if (url.includes('8bdc10b9') && method === 'GET') {
      return route.fulfill({ json: { value: MOCK_COLLEAGUES } });
    }

    if (url.includes('aa8fe143') && method === 'POST') {
      return route.fulfill({ json: { id: MOCK_SP_SESSION_ID } });
    }

    if (url.includes('73f67c6d') && method === 'POST') {
      return route.fulfill({ json: { id: `part-${Date.now()}` } });
    }

    return route.fulfill({ json: {} });
  });
}

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
    provider_token: 'mock-provider-token',
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
