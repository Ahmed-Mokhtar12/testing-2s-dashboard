# Hotel Training — Server-Side SharePoint Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all SharePoint I/O from the browser's (now scopeless) delegated Microsoft token to app-credential Supabase Edge Functions, fix the RLS/typing/hygiene defects found in the 2026-07-27 audit, and take the Hotel Training feature to production-verified.

**Architecture:** Browser = identity only (Azure OAuth exists solely to sign the user into Supabase; scopes stay `email profile openid offline_access`). All SharePoint reads AND writes go through Supabase Edge Functions that mint client-credentials app tokens (`https://graph.microsoft.com/.default`), matching the Application permissions IT granted (`Sites.Selected` + `User.Read.All`). Three new functions (`sp-read-columns`, `sp-submit-training`, `sp-manage-colleague`) join the existing `sp-read-colleagues`, all sharing a `_shared/` helper layer. The client keeps the Supabase mirror/sync-queue logic; `src/services/sharepoint.ts` shrinks to thin typed `supabase.functions.invoke` wrappers.

**Tech Stack:** React 18 + Vite + TanStack Query + react-hook-form/zod (frontend), Supabase Edge Functions (Deno) + supabase-js v2, Microsoft Graph v1.0, Playwright e2e, Supabase Postgres with RLS.

## Global Constraints

- Supabase project id: `yczcebfaqerlwfalrbjn` (region eu-north-1). Deploy Edge Functions with the Supabase MCP tool `deploy_edge_function` (the CLI is not logged in on this server).
- Azure app: **Two Seasons Insights Login Digitlab**, Client ID `a903ed32-cb50-4bce-bf4f-9c4e8c4d13f1`. Credentials already exist as Supabase secrets `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` (write-only; never printed).
- SharePoint site: host `2seasonshotels.sharepoint.com`, path `/sites/Two_Seasons_Training_Record`.
- List IDs (verified still valid — user made no structural SP changes): Colleagues_Master `8bdc10b9-01c8-4310-8a16-48eb83020d7e`, Monthly_Training `aa8fe143-854d-4646-a423-89bc44bb217d`, Monthly_Training_Participants `73f67c6d-f327-4c14-aa68-2b718afcd132`.
- Monthly_Training internal field names: `Title`, `field_1` (department, Choice), `field_4` (duration minutes), `field_5` (location), `field_6` (total participants), `field_7` (remarks), `field_8` (training date), `TrainerName_x002e_` (trainer names, MultiChoice).
- Admin allowlist (must match client `ADMIN_EMAILS` in `src/lib/hotel-training-constants.ts:27-31`): `ahmed.mokhtar@2seasonshotels.com`, `amir.monir@2seasonshotels.com`, `xarmaigne.narciso@2seasonshotels.com`.
- Dev origin is `http://localhost:8080` (vite.config.ts:10); production origin is `https://testing-2s-dashboard.digitlab.ai`.
- **Known live blocker:** Graph returns `accessDenied` on list reads because the Sites.Selected *site-level grant* has never been executed (Task 1 sends the IT request). All Edge Function work can be built and mock-tested before it lands; live verification (Task 15) is blocked until IT confirms.
- Run frontend checks with: `npm run build`, `npm run lint`, `npx playwright test tests/hotel-training.spec.ts --project=chromium --reporter=line`.
- KEEP the two uncommitted working-tree files until their tasks consume them: `src/hooks/useListColumns.ts` is REPLACED in Task 5 (do not commit the current delegated-token version); the 7th test in `tests/hotel-training.spec.ts` is KEPT and adapted in Task 5.
- Do not print, log, or commit any secret. `.env` must never be committed (Task 2 fixes the broken ignore rule protecting it).

---

### Task 1: IT request for the Sites.Selected site-level grant

The single external blocker. Admin consent in Entra is done; the per-site grant was never executed (verified live 2026-07-27: token OK, site resolution OK, list read `accessDenied`). Only a SharePoint/Global admin can perform it.

**Files:**
- Create: `docs/it-requests/2026-07-27-sites-selected-site-grant.md`

**Interfaces:**
- Produces: a self-contained request document the user emails to IT. Task 15 is blocked until IT confirms completion.

- [ ] **Step 1: Create the request document**

```markdown
# IT Request: Grant app access to the Two_Seasons_Training_Record SharePoint site

**App:** Two Seasons Insights Login Digitlab
**Client ID:** a903ed32-cb50-4bce-bf4f-9c4e8c4d13f1
**Requested by:** Ahmed Mokhtar
**Date:** 2026-07-27

## Background

The app registration already has the **Sites.Selected** (Application) Graph
permission with admin consent. Sites.Selected additionally requires a one-time,
per-site permission grant before the app can read/write that site's lists.
That grant has not been made yet, so the app currently receives
`accessDenied` from Microsoft Graph when reading list items (Graph
request-id 3af9c910-e7ad-4ccf-add6-07a0e2700dea, 2026-07-07, reproduced
2026-07-27).

## Action needed (5 minutes, Graph Explorer or PowerShell)

Sign in as a SharePoint Administrator / Global Administrator.

### Option A — Graph Explorer (https://aka.ms/ge)

1. Run:
   `GET https://graph.microsoft.com/v1.0/sites/2seasonshotels.sharepoint.com:/sites/Two_Seasons_Training_Record`
   Copy the full `id` value from the response (three comma-separated parts).
2. Run (replace {siteId} with the copied id):
   `POST https://graph.microsoft.com/v1.0/sites/{siteId}/permissions`
   Body:
   {
     "roles": ["write"],
     "grantedToIdentities": [{
       "application": {
         "id": "a903ed32-cb50-4bce-bf4f-9c4e8c4d13f1",
         "displayName": "Two Seasons Insights Login Digitlab"
       }
     }]
   }
   Note: Graph Explorer itself may need the Sites.FullControl.All delegated
   permission consented for this call (Modify permissions tab).

### Option B — PnP PowerShell

Grant-PnPAzureADAppSitePermission `
  -AppId "a903ed32-cb50-4bce-bf4f-9c4e8c4d13f1" `
  -DisplayName "Two Seasons Insights Login Digitlab" `
  -Site "https://2seasonshotels.sharepoint.com/sites/Two_Seasons_Training_Record" `
  -Permissions Write

## Why "write" and not "read"

The app both reads the colleague roster and writes training-session and
participant records to lists on this site. "write" covers both. No other
site is affected — Sites.Selected grants access ONLY to sites explicitly
granted this way.

## How we will verify

After you confirm, we will re-run our health check (the sp-read-colleagues
Supabase Edge Function). Expected: HTTP 200 with the colleague list instead
of accessDenied. We will confirm back the same day.
```

- [ ] **Step 2: Commit**

```bash
git add docs/it-requests/2026-07-27-sites-selected-site-grant.md
git commit -m "docs(it): request Sites.Selected site-level grant for training site"
```

- [ ] **Step 3: Hand to the user** — tell the user the file is ready to email to IT. Do not wait for IT; continue with Task 2.

---

### Task 2: Repo hygiene — fix the corrupted .gitignore

The last `.gitignore` line is literally `.env.superpowers/` — a mangled merge of `.env` and `.superpowers/` that matches neither. `.env` (contains project keys) is currently unignored; a blanket `git add .` would commit it.

**Files:**
- Modify: `.gitignore` (last line)

**Interfaces:**
- Produces: `.env`, `.superpowers/`, `supabase/.temp/`, `test-results/` all ignored; verified by `git status`.

- [ ] **Step 1: Check current state (red)**

Run: `git check-ignore .env; echo "exit=$?"`
Expected: `exit=1` (NOT ignored — this is the bug).

- [ ] **Step 2: Fix the file**

Replace the corrupted last line `.env.superpowers/` with these four lines:

```gitignore
.env
.superpowers/
supabase/.temp/
test-results/
```

- [ ] **Step 3: Verify (green)**

Run: `git check-ignore .env .superpowers supabase/.temp test-results; echo "exit=$?"`
Expected: all four paths printed, `exit=0`. Then `git status` must no longer show `.env`, `.superpowers/`, or `supabase/.temp/` as untracked. If `git ls-files test-results` prints anything, run `git rm -r --cached test-results`.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: repair corrupted .gitignore entry; ignore env, superpowers, supabase temp, test-results"
```

---

### Task 3: Shared Edge Function helpers + refactor sp-read-colleagues

Extract the app-token/site-id/Graph-fetch machinery (currently inlined in `sp-read-colleagues`) into `_shared/` modules the three new functions will reuse, add caller-identity and CORS helpers, and redeploy `sp-read-colleagues` on top of them.

**Files:**
- Create: `supabase/functions/_shared/graph.ts`
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/_shared/auth.ts`
- Modify: `supabase/functions/sp-read-colleagues/index.ts`
- Modify: `supabase/config.toml` (add `[functions.sp-read-colleagues]`)

**Interfaces:**
- Consumes: Supabase secrets `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`; auto-injected `SUPABASE_URL`/`SUPABASE_ANON_KEY`.
- Produces (used by Tasks 4, 6, 8):
  - `graph.ts`: `haveAzureCreds(): boolean`, `getAppToken(): Promise<string>`, `getSiteId(token: string): Promise<string>`, `graphFetch<T>(token: string, url: string, init?: RequestInit): Promise<T>` (throws `GraphError { status: number }`), `GRAPH_BASE`, `LIST_IDS = { colleagues, monthlyTraining, participants }`.
  - `http.ts`: `corsHeaders(req: Request): Record<string,string>`, `json(req: Request, body: unknown, status?: number): Response`.
  - `auth.ts`: `getCallerEmail(req: Request): Promise<string | null>` (lower-cased email of the Supabase-authenticated caller, or null).

- [ ] **Step 1: Write `supabase/functions/_shared/graph.ts`**

```typescript
const TENANT_ID = Deno.env.get('AZURE_TENANT_ID') ?? '';
const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET') ?? '';

export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
export const SP_SITE_HOST = '2seasonshotels.sharepoint.com';
export const SP_SITE_PATH = '/sites/Two_Seasons_Training_Record';

export const LIST_IDS = {
  colleagues: '8bdc10b9-01c8-4310-8a16-48eb83020d7e',
  monthlyTraining: 'aa8fe143-854d-4646-a423-89bc44bb217d',
  participants: '73f67c6d-f327-4c14-aa68-2b718afcd132',
} as const;

export function haveAzureCreds(): boolean {
  return Boolean(TENANT_ID && CLIENT_ID && CLIENT_SECRET);
}

export class GraphError extends Error {
  constructor(public status: number, body: string) {
    super(`Graph API ${status}: ${body}`);
    this.name = 'GraphError';
  }
}

export async function getAppToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }).toString(),
    },
  );
  if (!res.ok) throw new Error(`Token fetch failed: ${await res.text()}`);
  const body = await res.json();
  return body.access_token as string;
}

let cachedSiteId: string | null = null;

export async function getSiteId(token: string): Promise<string> {
  if (cachedSiteId) return cachedSiteId;
  const data = await graphFetch<{ id: string }>(
    token,
    `${GRAPH_BASE}/sites/${SP_SITE_HOST}:${SP_SITE_PATH}`,
  );
  cachedSiteId = data.id;
  return cachedSiteId;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function graphFetch<T = unknown>(
  token: string,
  url: string,
  init: RequestInit = {},
  retryCount = 0,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(url, { ...init, headers });

  if (res.status === 429 && retryCount < 3) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '10', 10);
    await delay(retryAfter * 1000);
    return graphFetch<T>(token, url, init, retryCount + 1);
  }

  if (!res.ok) {
    throw new GraphError(res.status, await res.text().catch(() => ''));
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
```

- [ ] **Step 2: Write `supabase/functions/_shared/http.ts`**

```typescript
const ALLOWED_ORIGINS = [
  'https://testing-2s-dashboard.digitlab.ai',
  'http://localhost:8080',
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 3: Write `supabase/functions/_shared/auth.ts`**

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2';

// verify_jwt=true means the gateway already validated the JWT signature;
// this resolves the caller to a live auth user and returns their email.
export async function getCallerEmail(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;
  return data.user.email.toLowerCase();
}
```

- [ ] **Step 4: Rewrite `supabase/functions/sp-read-colleagues/index.ts` on the shared helpers**

Behavior is unchanged (same response shapes, same 503-on-missing-creds guard, same `parseActive` hardening); only the plumbing moves to `_shared/`:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';

interface Colleague {
  id: string;
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
  isActive: boolean;
}

// SharePoint Yes/No columns normally return a JSON boolean, but be defensive:
// handle true, "true", "True", 1, "1", "Yes". Anything else is treated as inactive.
function parseActive(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }
  return false;
}

async function fetchColleagues(token: string): Promise<Colleague[]> {
  const siteId = await getSiteId(token);
  const results: Colleague[] = [];

  let url: string | null =
    `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.colleagues}/items` +
    '?$top=500&$expand=fields($select=EmployeeID,ColleagueName,Position,Section,Department,IsActive)';

  while (url) {
    const data = await graphFetch<{
      value: Array<{ id: string; fields: Record<string, unknown> }>;
      '@odata.nextLink'?: string;
    }>(token, url);

    for (const item of data.value) {
      const f = item.fields;
      const rawDept = f.Department;
      const department =
        rawDept && typeof rawDept === 'object'
          ? String((rawDept as { Value?: string }).Value ?? '')
          : String(rawDept ?? '');

      results.push({
        id: item.id,
        employeeId: String(f.EmployeeID ?? ''),
        colleagueName: String(f.ColleagueName ?? ''),
        position: String(f.Position ?? ''),
        section: String(f.Section ?? ''),
        department,
        isActive: parseActive(f.IsActive),
      });
    }

    url = data['@odata.nextLink'] ?? null;
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  if (!haveAzureCreds()) {
    return json(req, { error: 'Missing Azure credentials: set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET as Supabase secrets.' }, 503);
  }

  try {
    const token = await getAppToken();
    const colleagues = await fetchColleagues(token);
    return json(req, colleagues);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-read-colleagues error:', message);
    return json(req, { error: message }, 500);
  }
});
```

- [ ] **Step 5: Add config.toml entry**

Append to `supabase/config.toml` after the whatsapp function entries:

```toml
[functions.sp-read-colleagues]
verify_jwt = true
```

- [ ] **Step 6: Deploy**

Deploy with the Supabase MCP `deploy_edge_function` tool: project_id `yczcebfaqerlwfalrbjn`, name `sp-read-colleagues`, verify_jwt `true`, entrypoint `index.ts`, files: `sp-read-colleagues/index.ts` plus `_shared/graph.ts`, `_shared/http.ts` (upload the shared files with their relative names, e.g. name `_shared/graph.ts`, and import them as `../_shared/graph.ts`).

- [ ] **Step 7: Verify deployed behavior is unchanged**

Run (anon key is in `.env` as `VITE_SUPABASE_PUBLISHABLE_KEY`; export it to `$ANON` first):

```bash
ANON=$(grep VITE_SUPABASE_PUBLISHABLE_KEY .env | cut -d'"' -f2)
curl -s -w "\n%{http_code}\n" -X POST \
  "https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/sp-read-colleagues" \
  -H "Authorization: Bearer $ANON" -H "apikey: $ANON"
```

Expected until the IT grant lands: HTTP 500 with body containing `accessDenied` (same as before the refactor — proves token + site resolution still work through the shared helpers). After the grant: HTTP 200 with a JSON array.
Also verify: `curl -s -o /dev/null -w "%{http_code}" -X POST https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/sp-read-colleagues` (no auth) → `401` (verify_jwt active).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared supabase/functions/sp-read-colleagues/index.ts supabase/config.toml
git commit -m "refactor(edge): extract shared Graph/auth/http helpers; declare verify_jwt for sp-read-colleagues"
```

---

### Task 4: `sp-read-columns` Edge Function

Server-side replacement for the delegated `getListColumns` — returns the Monthly_Training choice columns and the real `typeAsString` of `field_5`/`field_7` (which finally answers the never-verified Number-vs-Text question at runtime).

**Files:**
- Create: `supabase/functions/sp-read-columns/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `_shared/graph.ts` (`haveAzureCreds`, `getAppToken`, `getSiteId`, `graphFetch`, `GRAPH_BASE`, `LIST_IDS`), `_shared/http.ts` (`corsHeaders`, `json`).
- Produces: `POST /functions/v1/sp-read-columns` → `200 { departments: string[], trainers: string[], locationTypeAsString: string, remarksTypeAsString: string }` | `503 { error }` | `500 { error }`. Consumed by Task 5's `invokeReadColumns()`.

- [ ] **Step 1: Write `supabase/functions/sp-read-columns/index.ts`**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';

interface GraphColumn {
  name: string;
  typeAsString?: string;
  choice?: { choices: string[] };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  if (!haveAzureCreds()) {
    return json(req, { error: 'Missing Azure credentials: set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET as Supabase secrets.' }, 503);
  }

  try {
    const token = await getAppToken();
    const siteId = await getSiteId(token);
    const data = await graphFetch<{ value: GraphColumn[] }>(
      token,
      `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.monthlyTraining}/columns`,
    );

    const find = (name: string) => data.value.find((column) => column.name === name);
    const deptCol = find('field_1');
    const trainerCol = find('TrainerName_x002e_');
    const locationCol = find('field_5');
    const remarksCol = find('field_7');

    return json(req, {
      departments: deptCol?.choice?.choices ?? [],
      trainers: trainerCol?.choice?.choices ?? [],
      locationTypeAsString: locationCol?.typeAsString ?? 'Number',
      remarksTypeAsString: remarksCol?.typeAsString ?? 'Number',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-read-columns error:', message);
    return json(req, { error: message }, 500);
  }
});
```

- [ ] **Step 2: Add config.toml entry**

```toml
[functions.sp-read-columns]
verify_jwt = true
```

- [ ] **Step 3: Deploy**

MCP `deploy_edge_function`: project_id `yczcebfaqerlwfalrbjn`, name `sp-read-columns`, verify_jwt `true`, files `sp-read-columns/index.ts` + `_shared/graph.ts` + `_shared/http.ts`.

- [ ] **Step 4: Verify**

```bash
ANON=$(grep VITE_SUPABASE_PUBLISHABLE_KEY .env | cut -d'"' -f2)
curl -s -w "\n%{http_code}\n" -X POST \
  "https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/sp-read-columns" \
  -H "Authorization: Bearer $ANON" -H "apikey: $ANON"
```

Expected until the IT grant: 500 with `accessDenied`. After the grant: 200 with the four keys (and the REAL `locationTypeAsString`/`remarksTypeAsString` values — Task 15 records them). No-auth curl → 401.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sp-read-columns supabase/config.toml
git commit -m "feat(edge): add sp-read-columns for Monthly_Training choice columns via app credentials"
```

---

### Task 5: Rewire `useListColumns` to the Edge Function (replaces the uncommitted delegated version)

The working tree holds an uncommitted `useListColumns.ts` that calls Graph with the browser `provider_token` — that token has no Graph scopes (OAuth scopes are `email profile openid offline_access`, `src/contexts/AuthContext.tsx:127`), so it can never succeed, and its `enabled: !!token` gate breaks email/password users (query never runs → `columns` undefined → `HotelTraining.tsx:363-366` renders empty dropdowns). Replace it entirely. Trainer choices come live (per user decision); departments stay from `DEPARTMENT_SECTIONS` (the cascading dept→section map is code-defined); location/remarks types come live with constant fallback.

**Files:**
- Modify: `src/hooks/useListColumns.ts` (full rewrite of the uncommitted version)
- Modify: `src/services/sharepoint.ts` (add `extractInvokeError` + `invokeReadColumns`; delete nothing yet)
- Modify: `src/hooks/useColleagues.ts` (import `extractInvokeError` from services instead of its local copy)
- Modify: `tests/helpers/hotel-training-mocks.ts` (add `MOCK_COLUMNS_FLAT` + `mockColumnsFunction`)
- Modify: `tests/hotel-training.spec.ts` (wire `mockColumnsFunction` into `openHotelTraining`; keep the uncommitted 7th test as-is)
- Test: `tests/hotel-training.spec.ts`

**Interfaces:**
- Consumes: `sp-read-columns` (Task 4); `ListColumnsResult` interface (already exported from `src/services/sharepoint.ts:102-107` — unchanged).
- Produces: `invokeReadColumns(): Promise<ListColumnsResult>` and `extractInvokeError(error: unknown): Promise<string>` exported from `src/services/sharepoint.ts` (Tasks 7/9 reuse `extractInvokeError`). `useListColumns()` keeps returning a TanStack `useQuery` result whose `data` is `ListColumnsResult` (consumer `HotelTraining.tsx:52` unchanged).

- [ ] **Step 1: Add mock + wire test setup (red)**

In `tests/helpers/hotel-training-mocks.ts`, after `MOCK_COLUMNS` add:

```typescript
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
```

In `tests/hotel-training.spec.ts`, import `mockColumnsFunction` and add `await mockColumnsFunction(page);` inside `openHotelTraining` right after `await mockColleaguesFunction(page);`.

- [ ] **Step 2: Run the trainer test to verify it fails against current code**

Run: `npx playwright test tests/hotel-training.spec.ts --project=chromium --reporter=line -g "trainer name dropdown"`
Expected: FAIL — the current (uncommitted) hook routes through `graph.microsoft.com` mocks or falls back to `TRAINER_OPTIONS`, so 'Xarmaigne Narciso' is present.

- [ ] **Step 3: Add the service wrappers**

In `src/services/sharepoint.ts`, add (near the top, after the imports; keep everything else for now):

```typescript
// supabase.functions.invoke wraps a non-2xx response in a FunctionsHttpError
// whose `message` is generic. The real reason lives in the response body.
export async function extractInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      /* response had no JSON body; fall through */
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export async function invokeReadColumns(): Promise<ListColumnsResult> {
  const { data, error } = await supabase.functions.invoke('sp-read-columns');
  if (error) {
    throw new Error(await extractInvokeError(error));
  }
  return data as ListColumnsResult;
}
```

In `src/hooks/useColleagues.ts`: delete its local `extractInvokeError` and import it: `import { extractInvokeError } from '@/services/sharepoint';`.

- [ ] **Step 4: Rewrite `src/hooks/useListColumns.ts` (full file)**

```typescript
import { useQuery } from '@tanstack/react-query';
import {
  DEPARTMENT_SECTIONS,
  LOCATION_TYPE_AS_STRING,
  REMARKS_TYPE_AS_STRING,
  TRAINER_OPTIONS,
} from '@/lib/hotel-training-constants';
import { invokeReadColumns } from '@/services/sharepoint';
import type { ListColumnsResult } from '@/services/sharepoint';

const STATIC_FALLBACK: ListColumnsResult = {
  departments: Object.keys(DEPARTMENT_SECTIONS),
  trainers: TRAINER_OPTIONS,
  locationTypeAsString: LOCATION_TYPE_AS_STRING,
  remarksTypeAsString: REMARKS_TYPE_AS_STRING,
};

export function useListColumns() {
  return useQuery<ListColumnsResult>({
    queryKey: ['listColumns'],
    queryFn: async (): Promise<ListColumnsResult> => {
      try {
        const live = await invokeReadColumns();
        return {
          // Departments must match DEPARTMENT_SECTIONS (the dept→section
          // cascade is code-defined), so they always come from constants.
          departments: Object.keys(DEPARTMENT_SECTIONS),
          trainers: live.trainers.length > 0 ? live.trainers : TRAINER_OPTIONS,
          locationTypeAsString: live.locationTypeAsString || LOCATION_TYPE_AS_STRING,
          remarksTypeAsString: live.remarksTypeAsString || REMARKS_TYPE_AS_STRING,
        };
      } catch (err) {
        console.error('[useListColumns] Falling back to constants:', err);
        return STATIC_FALLBACK;
      }
    },
    staleTime: 30 * 60 * 1000,
  });
}
```

Note: no `enabled` gate and no `useAuth` — the Edge Function authenticates via the Supabase session that `supabase.functions.invoke` attaches automatically, which exists for email/password users too.

- [ ] **Step 5: Run the full suite to verify green**

Run: `npx playwright test tests/hotel-training.spec.ts --project=chromium --reporter=line`
Expected: 7 passed. (The trainer test now sees only the two mocked live trainers; other tests still select department 'Engineering', which the constants provide.)

- [ ] **Step 6: Build + lint**

Run: `npm run build && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useListColumns.ts src/hooks/useColleagues.ts src/services/sharepoint.ts tests/helpers/hotel-training-mocks.ts tests/hotel-training.spec.ts
git commit -m "feat(hotel-training): trainer choices via sp-read-columns Edge Function; shared invoke error helper"
```

---

### Task 6: `sp-submit-training` Edge Function

Server-side training submission: creates the Monthly_Training item, then the participant rows, with the app token. The Supabase mirror/sync-queue writes stay client-side (unchanged, governed by RLS).

> **2026-07-27 amendment (user-approved):** Task 4's live schema probe found `TrainerName_x002e_` is a **multi-select People Picker** (`personOrGroup`, peopleOnly), not a Choice column. Writing a string array to it would fail. Per user decision, trainers are written as **real person values**: the function maps trainer names → emails (constant map; the three trainers are the three admins), resolves emails → SharePoint user **LookupIds** via the site's hidden **User Information List**, and writes `TrainerName_x002e_LookupId` with `@odata.type: Collection(Edm.Int32)`. The UIL list id is discovered empirically during implementation (Task 4's temporary-diagnostic-deploy pattern) and hardcoded alongside the other list ids. If a trainer's account cannot be resolved in the UIL, the function returns 400 naming the unresolvable trainer(s). The request body keeps `trainerNames: string[]` — no client-side changes.

**Files:**
- Create: `supabase/functions/sp-submit-training/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `_shared/graph.ts`, `_shared/http.ts`, `_shared/auth.ts` (Task 3).
- Produces: `POST /functions/v1/sp-submit-training` with JSON body
  `{ trainingId: string, title: string, department: string, durationMinutes: number, totalParticipants: number, location: string|number|null, remarks: string|number|null, trainingDate: string (ISO), trainerNames: string[], participants: Array<{ rowNo: number, employeeId: string, colleagueName: string, position: string, section: string, department: string }> }`
  → `200 { sharepointId: string, failedParticipants: Array<{ row: <participant>, error: string }> }` | `400/401/503/500 { error }`. Consumed by Task 7.

- [ ] **Step 1: Write `supabase/functions/sp-submit-training/index.ts`**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerEmail } from '../_shared/auth.ts';

interface ParticipantRow {
  rowNo: number;
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
}

interface SubmitBody {
  trainingId: string;
  title: string;
  department: string;
  durationMinutes: number;
  totalParticipants: number;
  location: string | number | null;
  remarks: string | number | null;
  trainingDate: string;
  trainerNames: string[];
  participants: ParticipantRow[];
}

// TrainerName_x002e_ is a multi-select People Picker; trainers must be written
// as person LookupIds, resolved via the site's hidden User Information List.
// The three trainers are the three admins. MUST stay in sync with
// TRAINER_OPTIONS / ADMIN_EMAILS in src/lib/hotel-training-constants.ts.
const TRAINER_EMAILS: Record<string, string> = {
  'Ahmed Mokhtar': 'ahmed.mokhtar@2seasonshotels.com',
  'Amir Monir': 'amir.monir@2seasonshotels.com',
  'Xarmaigne Narciso': 'xarmaigne.narciso@2seasonshotels.com',
};

// Site's hidden User Information List id — discovered empirically via a
// temporary diagnostic deploy (see task report); stable per site.
const UIL_LIST_ID = '<DISCOVERED-DURING-IMPLEMENTATION>';

const lookupIdCache = new Map<string, number>();

async function resolveTrainerLookupIds(
  token: string,
  siteId: string,
  names: string[],
): Promise<{ ids: number[]; unresolved: string[] }> {
  const ids: number[] = [];
  const unresolved: string[] = [];
  const toResolve = names.filter((n) => !lookupIdCache.has(TRAINER_EMAILS[n] ?? ''));

  if (toResolve.length > 0) {
    let url: string | null =
      `${GRAPH_BASE}/sites/${siteId}/lists/${UIL_LIST_ID}/items` +
      '?$top=500&$expand=fields($select=EMail,Title)';
    while (url) {
      const data = await graphFetch<{
        value: Array<{ id: string; fields: { EMail?: string; Title?: string } }>;
        '@odata.nextLink'?: string;
      }>(token, url);
      for (const item of data.value) {
        const email = item.fields.EMail?.toLowerCase();
        if (email) lookupIdCache.set(email, Number(item.id));
      }
      url = data['@odata.nextLink'] ?? null;
    }
  }

  for (const name of names) {
    const email = TRAINER_EMAILS[name]?.toLowerCase();
    const id = email ? lookupIdCache.get(email) : undefined;
    if (id === undefined) unresolved.push(name);
    else ids.push(id);
  }
  return { ids, unresolved };
}

function badRequest(body: SubmitBody): string | null {
  if (!body.trainingId || !/^TRN-\d{14}$/.test(body.trainingId)) return 'Invalid trainingId.';
  if (!body.title?.trim()) return 'Title is required.';
  if (!body.department?.trim()) return 'Department is required.';
  if (!Number.isFinite(body.durationMinutes) || body.durationMinutes <= 0) return 'Invalid duration.';
  if (!Array.isArray(body.trainerNames) || body.trainerNames.length === 0) return 'At least one trainer is required.';
  const unknown = body.trainerNames.filter((n) => !(n in TRAINER_EMAILS));
  if (unknown.length > 0) return `Unknown trainer(s): ${unknown.join(', ')}.`;
  if (!body.trainingDate || Number.isNaN(Date.parse(body.trainingDate))) return 'Invalid training date.';
  if (!Array.isArray(body.participants) || body.participants.length === 0) return 'At least one participant is required.';
  if (body.participants.length !== body.totalParticipants) {
    return `Participant count mismatch: expected ${body.totalParticipants}, got ${body.participants.length}.`;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return json(req, { error: 'Method not allowed' }, 405);
  }
  if (!haveAzureCreds()) {
    return json(req, { error: 'Missing Azure credentials: set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET as Supabase secrets.' }, 503);
  }

  const caller = await getCallerEmail(req);
  if (!caller) {
    return json(req, { error: 'Not authenticated.' }, 401);
  }

  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body.' }, 400);
  }

  const invalid = badRequest(body);
  if (invalid) {
    return json(req, { error: invalid }, 400);
  }

  try {
    const token = await getAppToken();
    const siteId = await getSiteId(token);

    const { ids: trainerIds, unresolved } = await resolveTrainerLookupIds(
      token,
      siteId,
      body.trainerNames,
    );
    if (unresolved.length > 0) {
      return json(req, {
        error: `Could not resolve trainer account(s) in SharePoint: ${unresolved.join(', ')}. ` +
          'The trainer must have visited the site at least once.',
      }, 400);
    }

    const session = await graphFetch<{ id: string }>(
      token,
      `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.monthlyTraining}/items`,
      {
        method: 'POST',
        body: JSON.stringify({
          fields: {
            Title: body.title,
            field_1: body.department,
            field_4: body.durationMinutes,
            field_5: body.location ?? null,
            field_6: body.totalParticipants,
            field_7: body.remarks ?? null,
            field_8: body.trainingDate,
            'TrainerName_x002e_LookupId@odata.type': 'Collection(Edm.Int32)',
            TrainerName_x002e_LookupId: trainerIds,
          },
        }),
      },
    );

    const failedParticipants: Array<{ row: ParticipantRow; error: string }> = [];
    for (const row of body.participants) {
      try {
        await graphFetch(
          token,
          `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.participants}/items`,
          {
            method: 'POST',
            body: JSON.stringify({
              fields: {
                Title: row.colleagueName,
                TrainingID: body.trainingId,
                RowNo: row.rowNo,
                EmployeeID: row.employeeId,
                ColleagueName: row.colleagueName,
                Position: row.position,
                Section: row.section,
                Department: row.department,
              },
            }),
          },
        );
      } catch (err) {
        failedParticipants.push({ row, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return json(req, { sharepointId: session.id, failedParticipants });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-submit-training error:', message);
    return json(req, { error: message }, 500);
  }
});
```

- [ ] **Step 2: Add config.toml entry**

```toml
[functions.sp-submit-training]
verify_jwt = true
```

- [ ] **Step 3: Deploy**

MCP `deploy_edge_function`: name `sp-submit-training`, verify_jwt `true`, files `sp-submit-training/index.ts` + `_shared/graph.ts` + `_shared/http.ts` + `_shared/auth.ts`.

- [ ] **Step 4: Verify auth guards via curl**

```bash
# no auth → 401 from the gateway
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/sp-submit-training
# anon key but no user session → 401 from getCallerEmail
ANON=$(grep VITE_SUPABASE_PUBLISHABLE_KEY .env | cut -d'"' -f2)
curl -s -w "\n%{http_code}\n" -X POST \
  "https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/sp-submit-training" \
  -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d '{}'
```

Expected: `401`, then `{"error":"Not authenticated."}` + `401`. (A real submit needs a signed-in user session + the IT grant — covered by e2e mocks in Task 7 and live in Task 15.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sp-submit-training supabase/config.toml
git commit -m "feat(edge): add sp-submit-training — server-side Monthly_Training + participant writes"
```

---

### Task 7: Rewire `useTrainingSubmit` to the Edge Function

**Files:**
- Modify: `src/services/sharepoint.ts` (add `invokeSubmitTraining`)
- Modify: `src/hooks/useTrainingSubmit.ts` (drop provider_token; call the function)
- Modify: `tests/helpers/hotel-training-mocks.ts` (add `mockSubmitFunction`)
- Modify: `tests/hotel-training.spec.ts` (wire into `openHotelTraining`)
- Test: `tests/hotel-training.spec.ts`

**Interfaces:**
- Consumes: `sp-submit-training` (Task 6); `extractInvokeError` (Task 5); existing `ParticipantPayload` interface (`src/services/sharepoint.ts:206-214`, unchanged).
- Produces: `invokeSubmitTraining(payload: SubmitTrainingRequest): Promise<SubmitTrainingResponse>` where `SubmitTrainingRequest = TrainingSessionPayload & { trainingId: string; participants: ParticipantPayload[] }` and `SubmitTrainingResponse = { sharepointId: string; failedParticipants: Array<{ row: ParticipantPayload; error: string }> }`. `useTrainingSubmit`'s external `SubmitInput`/`SubmitResult` shapes are unchanged (consumers `HotelTraining.tsx`/`ConfirmationStep` untouched).

- [ ] **Step 1: Add the submit mock and wire it (red)**

In `tests/helpers/hotel-training-mocks.ts` add:

```typescript
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
```

In `tests/hotel-training.spec.ts` `openHotelTraining`, add `await mockSubmitFunction(page);` after `mockColumnsFunction`.

- [ ] **Step 2: Confirm the happy-path test still passes BEFORE the hook change (it uses the old Graph mocks), then proceed** — this is a refactor-with-tests task; the red signal comes after Step 3 if wiring is wrong.

- [ ] **Step 3: Add `invokeSubmitTraining` to `src/services/sharepoint.ts`**

```typescript
export type SubmitTrainingRequest = TrainingSessionPayload & {
  trainingId: string;
  participants: ParticipantPayload[];
};

export interface SubmitTrainingResponse {
  sharepointId: string;
  failedParticipants: Array<{ row: ParticipantPayload; error: string }>;
}

export async function invokeSubmitTraining(
  payload: SubmitTrainingRequest,
): Promise<SubmitTrainingResponse> {
  const { data, error } = await supabase.functions.invoke('sp-submit-training', {
    body: payload,
  });
  if (error) {
    throw new Error(await extractInvokeError(error));
  }
  return data as SubmitTrainingResponse;
}
```

- [ ] **Step 4: Rewrite the mutation core of `src/hooks/useTrainingSubmit.ts`**

Replace the imports of `createTrainingSession`/`createParticipants` with `invokeSubmitTraining` (keep the `ParticipantPayload` type import), and replace lines 42-88 of the mutation (`const token = ...` through `const { failed } = await createParticipants(token, rows);`) with:

```typescript
    mutationFn: async ({ trainingDetails, participants }) => {
      const completed = participants.filter((participant) => participant.colleague !== null);
      if (completed.length !== trainingDetails.totalParticipants) {
        throw new Error(
          `Participant count mismatch: expected ${trainingDetails.totalParticipants}, got ${completed.length}`,
        );
      }

      const date = new Date(trainingDetails.date);
      date.setHours(trainingDetails.hour, trainingDetails.minute, 0, 0);
      const isoDate = date.toISOString();
      const trainingId = generateTrainingId();

      const rows: ParticipantPayload[] = completed.map((participant, index) => {
        const colleague = participant.colleague;
        if (!colleague) {
          throw new Error('Participant row is missing a colleague.');
        }

        return {
          trainingId,
          rowNo: index + 1,
          employeeId: colleague.employeeId,
          colleagueName: colleague.colleagueName,
          position: colleague.position,
          section: colleague.section,
          department: colleague.department,
        };
      });

      const { sharepointId, failedParticipants } = await invokeSubmitTraining({
        trainingId,
        title: trainingDetails.title,
        department: trainingDetails.department,
        durationMinutes: trainingDetails.durationMinutes,
        totalParticipants: trainingDetails.totalParticipants,
        location: trainingDetails.location ?? null,
        remarks: trainingDetails.remarks ?? null,
        trainingDate: isoDate,
        trainerNames: trainingDetails.trainerNames,
        participants: rows,
      });

      const failed = failedParticipants;
```

Everything from `if (failed.length > 0) {` onward (partial return, Supabase mirror insert, sync-queue fallback) stays byte-identical. The `session` from `useAuth()` is still used for `session?.user?.email` — keep the `useAuth` import and destructuring.

Note: the Edge Function posts participants as `{ rowNo, employeeId, ... }` — the same camelCase keys `ParticipantPayload` already uses, so `rows` passes through unchanged.

- [ ] **Step 5: Run the suite**

Run: `npx playwright test tests/hotel-training.spec.ts --project=chromium --reporter=line`
Expected: 7 passed (happy path and partial-sync tests now flow through the mocked Edge Function; the Supabase-failure test still exercises the mirror fallback).

- [ ] **Step 6: Build + lint**

Run: `npm run build && npm run lint` — both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/services/sharepoint.ts src/hooks/useTrainingSubmit.ts tests/helpers/hotel-training-mocks.ts tests/hotel-training.spec.ts
git commit -m "feat(hotel-training): submit trainings via sp-submit-training Edge Function"
```

---

### Task 8: `sp-manage-colleague` Edge Function (server-enforced admin)

Add/deactivate colleagues server-side. Today the admin gate is client-only (`isAdmin` in the forms); with app-credential writes the server MUST re-verify, or any authenticated user could forge admin actions by calling the function directly.

**Files:**
- Create: `supabase/functions/sp-manage-colleague/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `_shared/graph.ts`, `_shared/http.ts`, `_shared/auth.ts`.
- Produces: `POST /functions/v1/sp-manage-colleague` with body
  `{ action: 'add', colleague: { employeeId, colleagueName, position, section, department } }` → `200 { id: string }`, or
  `{ action: 'deactivate', itemId: string }` → `200 { ok: true }`;
  `403 { error }` for non-admin callers; `400/401/503/500 { error }`. Consumed by Task 9.

- [ ] **Step 1: Write `supabase/functions/sp-manage-colleague/index.ts`**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerEmail } from '../_shared/auth.ts';

// Server-side copy of the admin allowlist. MUST stay in sync with
// ADMIN_EMAILS in src/lib/hotel-training-constants.ts.
const ADMIN_EMAILS = [
  'ahmed.mokhtar@2seasonshotels.com',
  'amir.monir@2seasonshotels.com',
  'xarmaigne.narciso@2seasonshotels.com',
];

interface NewColleague {
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
}

type Body =
  | { action: 'add'; colleague: NewColleague }
  | { action: 'deactivate'; itemId: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return json(req, { error: 'Method not allowed' }, 405);
  }
  if (!haveAzureCreds()) {
    return json(req, { error: 'Missing Azure credentials: set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET as Supabase secrets.' }, 503);
  }

  const caller = await getCallerEmail(req);
  if (!caller) {
    return json(req, { error: 'Not authenticated.' }, 401);
  }
  if (!ADMIN_EMAILS.includes(caller)) {
    return json(req, { error: 'Unauthorised: admin access required.' }, 403);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body.' }, 400);
  }

  try {
    const token = await getAppToken();
    const siteId = await getSiteId(token);

    if (body.action === 'add') {
      const c = body.colleague;
      if (!c?.employeeId || !/^\d+$/.test(c.employeeId)) return json(req, { error: 'Employee ID must be numeric.' }, 400);
      if (!c.colleagueName?.trim() || !c.position?.trim() || !c.section?.trim() || !c.department?.trim()) {
        return json(req, { error: 'All colleague fields are required.' }, 400);
      }

      const result = await graphFetch<{ id: string }>(
        token,
        `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.colleagues}/items`,
        {
          method: 'POST',
          body: JSON.stringify({
            fields: {
              Title: c.colleagueName,
              EmployeeID: c.employeeId,
              ColleagueName: c.colleagueName,
              Position: c.position,
              Section: c.section,
              Department: c.department,
              IsActive: true,
            },
          }),
        },
      );
      return json(req, { id: result.id });
    }

    if (body.action === 'deactivate') {
      if (!body.itemId?.trim()) return json(req, { error: 'itemId is required.' }, 400);
      await graphFetch(
        token,
        `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.colleagues}/items/${body.itemId}/fields`,
        { method: 'PATCH', body: JSON.stringify({ IsActive: false }) },
      );
      return json(req, { ok: true });
    }

    return json(req, { error: 'Unknown action.' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-manage-colleague error:', message);
    return json(req, { error: message }, 500);
  }
});
```

- [ ] **Step 2: Add config.toml entry**

```toml
[functions.sp-manage-colleague]
verify_jwt = true
```

- [ ] **Step 3: Deploy**

MCP `deploy_edge_function`: name `sp-manage-colleague`, verify_jwt `true`, files `sp-manage-colleague/index.ts` + all three `_shared/` files.

- [ ] **Step 4: Verify guards via curl**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/sp-manage-colleague
ANON=$(grep VITE_SUPABASE_PUBLISHABLE_KEY .env | cut -d'"' -f2)
curl -s -w "\n%{http_code}\n" -X POST \
  "https://yczcebfaqerlwfalrbjn.supabase.co/functions/v1/sp-manage-colleague" \
  -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d '{"action":"deactivate","itemId":"1"}'
```

Expected: `401`, then `{"error":"Not authenticated."}` + `401` (anon key is not a user). The 403-for-non-admin path is covered by e2e mocks in Task 9 and live in Task 15.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sp-manage-colleague supabase/config.toml
git commit -m "feat(edge): add sp-manage-colleague with server-side admin allowlist enforcement"
```

---

### Task 9: Rewire AddMemberForm / RemoveMemberForm to the Edge Function

**Files:**
- Modify: `src/services/sharepoint.ts` (add `invokeManageColleague`)
- Modify: `src/components/hotel-training/AddMemberForm.tsx:52-85`
- Modify: `src/components/hotel-training/RemoveMemberForm.tsx:50-75`
- Modify: `tests/helpers/hotel-training-mocks.ts` (add `mockManageColleagueFunction`)
- Modify: `tests/hotel-training.spec.ts` (wire into `openHotelTraining`)
- Test: `tests/hotel-training.spec.ts`

**Interfaces:**
- Consumes: `sp-manage-colleague` (Task 8), `extractInvokeError` (Task 5), existing `NewColleaguePayload` interface (`src/services/sharepoint.ts:259-265`, unchanged).
- Produces: `invokeManageColleague(req: ManageColleagueRequest): Promise<{ id?: string; ok?: boolean }>` with `type ManageColleagueRequest = { action: 'add'; colleague: NewColleaguePayload } | { action: 'deactivate'; itemId: string }`.

- [ ] **Step 1: Add mock + wire (red)**

In `tests/helpers/hotel-training-mocks.ts`:

```typescript
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
```

Wire `await mockManageColleagueFunction(page);` into `openHotelTraining` after `mockSubmitFunction`.

- [ ] **Step 2: Add the service wrapper**

In `src/services/sharepoint.ts`:

```typescript
export type ManageColleagueRequest =
  | { action: 'add'; colleague: NewColleaguePayload }
  | { action: 'deactivate'; itemId: string };

export async function invokeManageColleague(
  request: ManageColleagueRequest,
): Promise<{ id?: string; ok?: boolean }> {
  const { data, error } = await supabase.functions.invoke('sp-manage-colleague', {
    body: request,
  });
  if (error) {
    throw new Error(await extractInvokeError(error));
  }
  return data as { id?: string; ok?: boolean };
}
```

- [ ] **Step 3: Rewire `AddMemberForm.tsx`**

Replace the import `import { createColleague } from '@/services/sharepoint';` with `import { invokeManageColleague } from '@/services/sharepoint';`. In `onSubmit`, delete the token block (lines 58-62):

```typescript
    const token = session?.provider_token;
    if (!token) {
      toast.error('No Microsoft session token. Please sign in again.');
      return;
    }
```

and replace the `createColleague(token, {...})` call with:

```typescript
      await invokeManageColleague({
        action: 'add',
        colleague: {
          employeeId: values.employeeId,
          colleagueName: values.name,
          position: values.position,
          section: values.section,
          department: values.department,
        },
      });
```

Then change `const { session, user } = useAuth();` to `const { user } = useAuth();` (session no longer used).

- [ ] **Step 4: Rewire `RemoveMemberForm.tsx`**

Replace the `patchColleague` import with `invokeManageColleague`. In `handleRemove`, delete the token block (lines 57-61) and replace `await patchColleague(token, selected.id, { IsActive: false });` with:

```typescript
      await invokeManageColleague({ action: 'deactivate', itemId: selected.id });
```

Change `const { session, user } = useAuth();` to `const { user } = useAuth();`.

- [ ] **Step 5: Run suite + build + lint**

Run: `npx playwright test tests/hotel-training.spec.ts --project=chromium --reporter=line && npm run build && npm run lint`
Expected: 7 passed; build and lint exit 0. (Test 3 — admin tab visibility — is unaffected; the forms' network path is now mocked at the function URL.)

- [ ] **Step 6: Commit**

```bash
git add src/services/sharepoint.ts src/components/hotel-training/AddMemberForm.tsx src/components/hotel-training/RemoveMemberForm.tsx tests/helpers/hotel-training-mocks.ts tests/hotel-training.spec.ts
git commit -m "feat(hotel-training): admin add/remove via sp-manage-colleague Edge Function"
```

---

### Task 10: Delete the dead delegated-Graph layer

With all four flows on Edge Functions, remove every browser Graph/provider_token code path and the now-dead mocks. After this task, `grep -rn "provider_token" src/` must return ZERO hits and `grep -rn "graph.microsoft.com" src/ tests/` must return zero hits.

**Files:**
- Modify: `src/services/sharepoint.ts` (delete `graphRequest`, `getSiteId`, `resetSiteIdCache`, `getListColumns`, `getColleagues`, `createTrainingSession`, `createParticipants`, `createColleague`, `patchColleague`, the `GRAPH_BASE` const, the `cachedSiteId`/`delay` helpers, and the now-unused `toast` import; KEEP: `extractInvokeError`, `invokeReadColumns`, `invokeSubmitTraining`, `invokeManageColleague`, and the interfaces `ListColumnsResult`, `TrainingSessionPayload`, `ParticipantPayload`, `CreateParticipantsResult` (delete this one too if nothing imports it — check first), `NewColleaguePayload`, `SubmitTrainingRequest`, `SubmitTrainingResponse`, `ManageColleagueRequest`)
- Modify: `tests/helpers/hotel-training-mocks.ts` (delete `mockGraphAPI`, `MOCK_COLLEAGUES` (raw Graph shape), `MOCK_COLUMNS` (raw Graph shape), `MOCK_SITE_ID`; keep `MOCK_COLLEAGUES_FLAT`, `MOCK_COLUMNS_FLAT`, the function mocks, `setMockAuthSession` — and remove `provider_token: 'mock-provider-token'` from the fake session)
- Modify: `tests/hotel-training.spec.ts` (remove the `mockGraphAPI` import and its call in `openHotelTraining`)
- Modify: `index.html` (remove `https://graph.microsoft.com` from `connect-src` in the CSP meta tag — no browser code calls Graph anymore; keep `login.microsoftonline.com` only if the OAuth redirect flow needs it — check: Supabase OAuth redirects top-level, which CSP `connect-src` does not govern, so it can go too; verify sign-in still works in dev after removal)
- Test: full suite

**Interfaces:**
- Consumes: everything landed in Tasks 5-9.
- Produces: `src/services/sharepoint.ts` is invoke-wrappers + types only. No production or test code references `graph.microsoft.com` or `provider_token`.

- [ ] **Step 1: Check remaining consumers before deleting**

Run: `grep -rn "createTrainingSession\|createParticipants\|createColleague\|patchColleague\|getColleagues\|getListColumns\|graphRequest\|getSiteId\|resetSiteIdCache\|CreateParticipantsResult" src/ tests/`
Expected: no hits outside `src/services/sharepoint.ts` itself. If any remain, a previous task was incomplete — fix it first.

- [ ] **Step 2: Delete the dead code** per the Files list above.

- [ ] **Step 3: Verify zero-reference invariants**

Run: `grep -rn "provider_token" src/ tests/; grep -rn "graph.microsoft.com" src/ tests/; echo "exit=$?"`
Expected: no output from either grep (final `exit=1` from the last grep is the pass signal).

- [ ] **Step 4: Full suite + build + lint**

Run: `npx playwright test tests/hotel-training.spec.ts --project=chromium --reporter=line && npm run build && npm run lint`
Expected: 7 passed, build/lint clean.

- [ ] **Step 5: Manually verify Microsoft sign-in still works after the CSP edit**

Run `npm run dev`, open `http://localhost:8080/login`, click "Sign in with Microsoft", confirm the redirect to `login.microsoftonline.com` still happens (top-level navigation is not blocked by connect-src). If it fails, restore `https://login.microsoftonline.com` to connect-src and note why.

- [ ] **Step 6: Commit**

```bash
git add src/services/sharepoint.ts tests/helpers/hotel-training-mocks.ts tests/hotel-training.spec.ts index.html
git commit -m "refactor(hotel-training): remove dead delegated Graph layer; browser no longer calls graph.microsoft.com"
```

---

### Task 11: RLS fixes migration (UPDATE policy + case-insensitive INSERT)

Two defects in `supabase/migrations/20260610120000_hotel_training.sql`: (a) no UPDATE policy exists on `training_sessions`, so the `sync_status='partial'` update in `useTrainingSubmit.ts:129-132` silently updates 0 rows under RLS; (b) the INSERT policy compares `submitted_by = auth.jwt()->>'email'` case-sensitively (line 49) while the participants policy lower()s both sides — a mixed-case Microsoft email fails the session insert.

**Files:**
- Create: `supabase/migrations/20260727100000_hotel_training_rls_fixes.sql`

**Interfaces:**
- Consumes: existing tables/policies from `20260610120000_hotel_training.sql`.
- Produces: `training_sessions` accepts case-insensitive inserts and owner updates.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260727100000_hotel_training_rls_fixes.sql
-- (a) Case-insensitive INSERT check (match the participants policy).
-- (b) Owners can UPDATE their own sessions (needed for sync_status='partial').

drop policy "users can insert training sessions" on public.training_sessions;

create policy "users can insert training sessions"
  on public.training_sessions for insert to authenticated
  with check (lower(submitted_by) = lower(auth.jwt()->>'email'));

create policy "users can update their own training sessions"
  on public.training_sessions for update to authenticated
  using (lower(submitted_by) = lower(auth.jwt()->>'email'))
  with check (lower(submitted_by) = lower(auth.jwt()->>'email'));
```

- [ ] **Step 2: Apply to the live project**

Apply with the Supabase MCP `apply_migration` tool: project_id `yczcebfaqerlwfalrbjn`, name `hotel_training_rls_fixes`, query = the SQL above.

- [ ] **Step 3: Verify policies**

Run via MCP `execute_sql`:

```sql
select policyname, cmd, qual, with_check
from pg_policies
where tablename = 'training_sessions'
order by policyname;
```

Expected: 3 policies — the SELECT one, the recreated INSERT with `lower(...)` in `with_check`, and the new UPDATE with both `using` and `with_check` populated.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260727100000_hotel_training_rls_fixes.sql
git commit -m "fix(db): case-insensitive session insert policy; add owner UPDATE policy for sync_status"
```

---

### Task 12: Regenerate Supabase types, remove `UntypedSupabase` (R4)

`src/integrations/supabase/types.ts` predates the training tables (0 hits for `training_sessions`), so `useTrainingSubmit` bypasses typing with an `UntypedSupabase` cast (`src/hooks/useTrainingSubmit.ts:29-36`).

**Files:**
- Modify: `src/integrations/supabase/types.ts` (regenerated)
- Modify: `src/hooks/useTrainingSubmit.ts`

**Interfaces:**
- Consumes: live schema (incl. Task 11's policies — policies don't affect types, but regenerate after applying anyway).
- Produces: fully typed `supabase.from('training_sessions' | 'training_participants' | 'training_sync_queue')` calls.

- [ ] **Step 1: Regenerate types**

Use the Supabase MCP `generate_typescript_types` tool (project_id `yczcebfaqerlwfalrbjn`) and write the output over `src/integrations/supabase/types.ts`.

- [ ] **Step 2: Verify the tables are present**

Run: `grep -c "training_sessions\|training_participants\|training_sync_queue" src/integrations/supabase/types.ts`
Expected: > 0.

- [ ] **Step 3: Remove the cast**

In `src/hooks/useTrainingSubmit.ts`: delete the `UntypedSupabase` type and `const trainingDb = supabase as unknown as UntypedSupabase;` (lines 29-36), then replace all four `trainingDb.` references with `supabase.` . The `payload` object in the sync-queue insert may need `as unknown as Json` if the generated `Json` type complains — import `Json` from `@/integrations/supabase/types` only if the build requires it.

- [ ] **Step 4: Build + suite**

Run: `npm run build && npm run lint && npx playwright test tests/hotel-training.spec.ts --project=chromium --reporter=line`
Expected: all clean, 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/integrations/supabase/types.ts src/hooks/useTrainingSubmit.ts
git commit -m "chore(types): regenerate Supabase types with training tables; drop UntypedSupabase cast (R4)"
```

---

### Task 13: E2E test for colleague-load failure

The failure branch of `mockColleaguesFunction` (`opts.failure`) is dead code — no test exercises it, yet a failing colleague load is exactly what production exhibits today. Commit `bbd8043` added user-visible error surfacing; cover it.

**Files:**
- Modify: `tests/hotel-training.spec.ts` (new test)
- Test: `tests/hotel-training.spec.ts`

**Interfaces:**
- Consumes: `mockColleaguesFunction(page, { failure: true })` (already implemented, `tests/helpers/hotel-training-mocks.ts:114-133`); `useColleagues` error surfacing (`src/hooks/useColleagues.ts:26-29`).

- [ ] **Step 1: Find the exact error UI** — read how `HotelTraining.tsx` renders the `useColleagues` error state (search for `colleaguesError` / `error` around the loading gate near line 52) and note the visible text (e.g. a banner containing "Could not load colleagues from SharePoint"). Use that exact copy in the assertion below.

- [ ] **Step 2: Write the failing-path test**

Add to `tests/hotel-training.spec.ts` (adjust the assertion text to what Step 1 found):

```typescript
  test('colleague load failure surfaces an error instead of empty dropdowns', async ({ page }) => {
    await setMockAuthSession(page, USER_EMAIL);
    await mockColumnsFunction(page);
    await mockSubmitFunction(page);
    await mockManageColleagueFunction(page);
    await mockColleaguesFunction(page, { failure: true });
    await mockSupabaseRest(page);
    await page.goto('/dashboard/hotel-training');

    await expect(page.getByText(/Could not load colleagues from SharePoint/i)).toBeVisible({ timeout: 15_000 });
  });
```

Note this test intentionally does NOT use `openHotelTraining` (which waits for the loading state to clear into success).

- [ ] **Step 3: Run it**

Run: `npx playwright test tests/hotel-training.spec.ts --project=chromium --reporter=line -g "colleague load failure"`
Expected: PASS. If it fails because the UI shows nothing, that is a real product gap — surface it to the user before writing UI code (per audit, `useColleagues` throws a descriptive error; `HotelTraining` should render it).

- [ ] **Step 4: Full suite + commit**

Run: `npx playwright test tests/hotel-training.spec.ts --project=chromium --reporter=line`
Expected: 8 passed.

```bash
git add tests/hotel-training.spec.ts
git commit -m "test(hotel-training): cover colleague-load failure surfacing"
```

---

### Task 14: Documentation reconciliation

Make the docs stop asserting things the code contradicts.

**Files:**
- Modify: `docs/superpowers/plans/2026-06-10-hotel-training.md`
- Modify: `docs/superpowers/specs/2026-06-10-hotel-training-design.md`
- Modify: `README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Annotate the old plan** — at the top of the R1-R7 section add a dated note:

```markdown
> **2026-07-27 update:** The delegated (browser provider_token) Graph architecture
> was replaced by app-credential Edge Functions (sp-read-colleagues,
> sp-read-columns, sp-submit-training, sp-manage-colleague) — see
> docs/superpowers/plans/2026-07-27-hotel-training-server-side-completion.md.
> Status: R2 (code half) done via sp-read-colleagues; R3 obsolete (provider_token
> no longer used anywhere); R4 done (types regenerated, cast removed); R5 done
> (migration 20260727100000); R6 accepted as-is for Phase 1. R1/R2-runtime/R7
> are executed as Task 15 of the new plan once IT lands the Sites.Selected
> site-level grant.
```

- [ ] **Step 2: Add an architecture-pivot note to the spec** — under the spec's auth/architecture section, add a short dated block stating: browser OAuth = identity only (`email profile openid offline_access`); all SharePoint I/O is server-side via Edge Functions with `Sites.Selected` Application permission + per-site grant; the spec's original delegated-token design is superseded.

- [ ] **Step 3: Fix README CSP notes** — update the README's security/CSP bullet list to match `index.html` exactly as of Task 10 (connect-src without `graph.microsoft.com`; img-src includes `2s-dashboard.digitlab.ai`, not `lovable.dev`).

- [ ] **Step 4: Fix the test-count claim** — where the old plan says "6 Playwright tests", annotate "(now 8 — trainer-choices test and colleague-failure test added 2026-07-27)".

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-06-10-hotel-training.md docs/superpowers/specs/2026-06-10-hotel-training-design.md README.md
git commit -m "docs: reconcile plan/spec/README with server-side SharePoint architecture"
```

---

### Task 15: Live verification after the IT grant lands (BLOCKED on Task 1's IT action)

Do not start until IT confirms the site-level grant. Everything here runs against real SharePoint.

**Files:**
- Modify: `docs/superpowers/plans/2026-06-10-hotel-training.md` (record results in R1/R2/R7 Notes)

**Interfaces:**
- Consumes: all deployed functions; a real `@2seasonshotels.com` browser session (the user drives the browser; the agent drives curl checks).

- [ ] **Step 1: Confirm the grant** — re-run the Task 3 curl. Expected: HTTP 200 with a JSON array of real colleagues. If still `accessDenied`, stop and reply to IT (include a fresh Graph request-id from the response).

- [ ] **Step 2: Verify sp-read-columns live** — Task 4 curl. Expected: 200. **Record the real `locationTypeAsString` and `remarksTypeAsString` values.** If they are not `Number`, update `LOCATION_TYPE_AS_STRING`/`REMARKS_TYPE_AS_STRING` in `src/lib/hotel-training-constants.ts` to match (they are the offline fallback) and commit: `git commit -m "fix(hotel-training): align location/remarks fallback types with live SharePoint"`.

- [ ] **Step 3: R2 runtime — Department populates** — user signs in at the deployed app, opens Hotel Training Step 2, selects a colleague: Dept badge must be non-empty. Record in R2's Notes.

- [ ] **Step 4: R1 — one real end-to-end submission** — user completes the wizard with 2-3 participants. Then verify all three targets: (a) new item in Monthly_Training with all 8 fields populated, (b) N rows in Monthly_Training_Participants with matching `TRN-yyyyMMddHHmmss` id, (c) via MCP `execute_sql`: `select training_id, sync_status, total_participants from public.training_sessions order by submitted_at desc limit 1;` → `sync_status = 'synced'`. Record the TrainingID in R1's Notes.

- [ ] **Step 5: R7 — admin add/remove smoke** — as an admin email: add a test colleague (appears in Colleagues_Master, `IsActive: true`), deactivate it (`IsActive` flips false, item still exists, gone from participant search). As a NON-admin (or via curl with a non-admin user JWT): confirm `sp-manage-colleague` returns 403. Record in R7's Notes.

- [ ] **Step 6: Commit the recorded results**

```bash
git add docs/superpowers/plans/2026-06-10-hotel-training.md
git commit -m "docs: record R1/R2/R7 live verification results"
```

---

### Task 16: Push to origin

The entire feature (30+ commits by now) exists only on this server.

- [ ] **Step 1: Confirm remote & branch state**

Run: `git remote -v && git status && git log --oneline origin/main..main | head -40`
Expected: clean working tree, all task commits present.

- [ ] **Step 2: Confirm with the user, then push**

```bash
git push origin main
```

- [ ] **Step 3: Verify**

Run: `git status` → "Your branch is up to date with 'origin/main'."

---

## Self-Review

- **Spec coverage:** Every audit finding maps to a task — site grant (T1), .gitignore (T2), shared helpers (T3), columns read (T4), useListColumns replacement incl. email/password-user regression (T5), submit migration (T6/T7), admin migration with server-side enforcement (T8/T9), dead-code + CSP cleanup (T10), RLS UPDATE + R5 (T11), R4 types (T12), e2e failure coverage + stale-mock removal (T13 + T10), docs reconciliation incl. R3-obsolete (T14), R1/R2-runtime/R7 + field-type verification (T15), unpushed commits (T16). Deliberately excluded per user decisions: trainer-email resolution via `/users` (User.Read.All) — user chose plain live trainer choices; R6 stays accepted-as-is.
- **Placeholder scan:** all code steps carry full code; the two intentionally open points are marked as verify-then-act steps with explicit expected outcomes (Task 13 Step 1 reads the real error copy; Task 15 Step 2 records real column types).
- **Type consistency:** `ListColumnsResult`, `ParticipantPayload`, `NewColleaguePayload` reuse the existing exported interfaces; `invokeReadColumns`/`invokeSubmitTraining`/`invokeManageColleague`/`extractInvokeError` names are used identically across Tasks 5/7/9/10; Edge Function request/response shapes in Tasks 6/8 match the wrappers in Tasks 7/9 key-for-key (camelCase throughout).
