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
const NAMED_EXTRA_COLLEAGUES = [
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

// Only these four appear in MOCK_COLUMNS_FLAT.departments, so generated rows stay
// consistent with the directory the wizard is told exists.
const FILLER_DEPARTMENTS = ['Engineering', 'Finance', 'Front Office', 'Human Resources'];

// Deterministic filler, so a roster can reach any cap without hand-writing a
// hundred lines. Generated rather than random on purpose: Math.random() in a
// fixture makes a failing test unreproducible, and this file's whole job is to
// make the 100-participant layout test repeatable.
function fillerColleagues(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const department = FILLER_DEPARTMENTS[n % FILLER_DEPARTMENTS.length];
    return {
      id: `col-gen-${n}`,
      employeeId: String(3000 + n),
      // Zero-padded so the display order is the array order — an unpadded
      // "Trainee 10" sorts before "Trainee 2" in any name-ordered UI and would
      // make first/last row assertions surprising.
      colleagueName: `Trainee ${String(n).padStart(3, '0')}`,
      position: 'Staff',
      section: department,
      department,
      isActive: true,
    };
  });
}

/**
 * A roster with at least `activeNeeded` ACTIVE colleagues.
 *
 * The wizard blocks duplicate participants, so filling N participant rows needs
 * N distinct active colleagues; MOCK_COLLEAGUES_FLAT has only 3. Kept SEPARATE
 * from MOCK_COLLEAGUES_FLAT rather than extending it: appending to the shared
 * fixture was tried first and made tests/hotel-training.spec.ts flaky (the
 * participant Popover's close animation can leave its previous content mounted
 * for a moment, and a longer option list widened that race enough to
 * occasionally produce two DOM matches for one name — reproduced locally). So
 * this list's size has zero effect on the wizard suite.
 */
export function makeManyColleagues(activeNeeded: number) {
  // `activeNeeded` filler rows are generated REGARDLESS of how many named active
  // colleagues already exist, so the LAST `activeNeeded` active entries are
  // always generated ones. Callers slice from the tail exactly so their seeded
  // rows never depend on which of the shared MOCK_COLLEAGUES_FLAT entries happen
  // to be active (Dave Black is not); subtracting the named count would put
  // those shared entries back inside the slice and reintroduce that coupling.
  return [...MOCK_COLLEAGUES_FLAT, ...NAMED_EXTRA_COLLEAGUES, ...fillerColleagues(activeNeeded)];
}

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
  // `entries` overrides the list entirely. Needed for the layout case: the escape
  // hatch used to render below the matching staff inside a 300px scroll box, so
  // proving it stays reachable needs more staff than that box can hold.
  opts: { failure?: boolean; entries?: Array<{ displayName: string; email: string }> } = {},
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
      return route.fulfill({ json: opts.entries ?? MOCK_TRAINERS_FLAT });
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
  opts: {
    onBody?: (body: unknown) => void;
    // Row numbers SharePoint should reject, so the partial-write path can be
    // exercised. The real function returns { row, error } per failure; the row
    // is echoed back from the request so the shape matches production exactly
    // rather than being invented here.
    failRowNos?: number[];
  } = {},
) {
  await page.route(
    `https://${PROJECT_REF}.supabase.co/functions/v1/sp-submit-training`,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 200, body: 'ok' });
      }
      const body = route.request().postDataJSON() as {
        participants?: Array<{ rowNo: number }>;
      };
      opts.onBody?.(body);
      const failRowNos = new Set(opts.failRowNos ?? []);
      const failedParticipants = (body?.participants ?? [])
        .filter((row) => failRowNos.has(row.rowNo))
        .map((row) => ({ row, error: 'Graph API 429: throttled' }));
      return route.fulfill({ json: { sharepointId: MOCK_SP_SESSION_ID, failedParticipants } });
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

export const PROJECT_REF = 'yczcebfaqerlwfalrbjn';
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

export interface CapturedWrite {
  table: string;
  method: string;
  body: unknown;
}

// One row of public.sharepoint_mirror, shaped as PostgREST returns it for the
// .eq('key', ...).maybeSingle() the hooks issue. `fetched_at` is relative to the
// moment the mock is installed rather than a fixed date: a literal would silently
// age past every TTL and turn "renders from the mirror" into "renders from the
// edge function", which passes for the wrong reason.
export function mirrorRow(payload: unknown, ageMs = 0) {
  return [{ payload, fetched_at: new Date(Date.now() - ageMs).toISOString() }];
}

export async function mockSupabaseRest(
  page: Page,
  opts: {
    trainingSessionFailure?: boolean;
    // Records every non-GET REST call so a test can assert what was actually
    // written. Needed because the interesting property of the partial-write path
    // is which rows reach the database, and that is invisible from the UI.
    onWrite?: (write: CapturedWrite) => void;
    // What GET /rest/v1/sharepoint_mirror?key=eq.<key> returns, per key. A key
    // that is absent here answers with [], which supabase-js maybeSingle turns
    // into data: null — so by default every test keeps exercising the edge-function
    // path exactly as it did before the mirror existed.
    mirror?: Partial<Record<'colleagues' | 'trainers' | 'columns', unknown[]>>;
  } = {},
) {
  await page.route(`https://${PROJECT_REF}.supabase.co/rest/v1/**`, async (route) => {
    const url = route.request().url();

    if (url.includes('/sharepoint_mirror')) {
      const key = new URL(url).searchParams.get('key')?.replace(/^eq\./, '') ?? '';
      const row = opts.mirror?.[key as keyof NonNullable<typeof opts.mirror>];
      return route.fulfill({ json: row ?? [] });
    }

    const method = route.request().method();

    if (opts.onWrite && method !== 'GET' && method !== 'OPTIONS') {
      const table = new URL(url).pathname.replace(/^\/rest\/v1\//, '');
      let body: unknown = null;
      try {
        body = route.request().postDataJSON();
      } catch {
        body = route.request().postData();
      }
      opts.onWrite({ table, method, body });
    }

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

// sp-search-directory: the trainer picker's escape hatch. `results` is what the
// function would return for any query — tests assert on which of them the UI offers
// and which it refuses, not on Graph's matching, which is mocked away here.
//
// `onQuery` records what was actually searched, so a test can prove the click sent
// the typed text rather than something stale.
export async function mockSearchDirectoryFunction(
  page: Page,
  opts: {
    results?: Array<{ displayName: string; email: string; inSite: boolean; jobTitle?: string }>;
    failure?: boolean;
    onQuery?: (query: string) => void;
  } = {},
) {
  await page.route(
    `https://${PROJECT_REF}.supabase.co/functions/v1/sp-search-directory`,
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 200, body: 'ok' });
      }
      let query = '';
      try {
        query = String((route.request().postDataJSON() as { q?: unknown })?.q ?? '');
      } catch {
        query = '';
      }
      opts.onQuery?.(query);
      if (opts.failure) {
        return route.fulfill({ status: 500, json: { error: 'Graph is unavailable.' } });
      }
      return route.fulfill({ json: { query, results: opts.results ?? [] } });
    },
  );
}
