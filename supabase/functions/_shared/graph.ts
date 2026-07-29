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
  // Site's hidden User Information List. sp-submit-training resolves trainer
  // LookupIds against this same list via its own local UIL_LIST_ID constant
  // (see supabase/functions/sp-submit-training/index.ts) — not yet unified
  // with this entry; that function is left untouched deliberately.
  uil: '265691f8-3786-4e9f-932f-79835f30a6cf',
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
    // Retry-After can be either delay-seconds or an HTTP-date; parseInt on an
    // HTTP-date yields NaN, which would otherwise produce an immediate
    // (delay(NaN) resolves right away) hot-retry loop against Graph.
    const parsed = parseInt(res.headers.get('Retry-After') ?? '10', 10);
    const retryAfter = Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
    await delay(retryAfter * 1000);
    return graphFetch<T>(token, url, init, retryCount + 1);
  }

  if (!res.ok) {
    throw new GraphError(res.status, await res.text().catch(() => ''));
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
