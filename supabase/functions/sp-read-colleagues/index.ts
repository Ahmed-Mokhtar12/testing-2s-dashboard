import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TENANT_ID = Deno.env.get('AZURE_TENANT_ID') ?? '';
const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET') ?? '';
const SP_SITE_HOST = '2seasonshotels.sharepoint.com';
const SP_SITE_PATH = '/sites/Two_Seasons_Training_Record';
const COLLEAGUES_LIST_ID = '8bdc10b9-01c8-4310-8a16-48eb83020d7e';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function getAppToken(): Promise<string> {
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
  const json = await res.json();
  return json.access_token as string;
}

let cachedSiteId: string | null = null;

async function getSiteId(token: string): Promise<string> {
  if (cachedSiteId) return cachedSiteId;
  const res = await fetch(`${GRAPH_BASE}/sites/${SP_SITE_HOST}:${SP_SITE_PATH}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`getSiteId failed: ${await res.text()}`);
  const json = await res.json();
  cachedSiteId = json.id as string;
  return cachedSiteId;
}

interface Colleague {
  id: string;
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
  isActive: boolean;
}

async function fetchColleagues(token: string): Promise<Colleague[]> {
  const siteId = await getSiteId(token);
  const results: Colleague[] = [];

  let url: string | null =
    `${GRAPH_BASE}/sites/${siteId}/lists/${COLLEAGUES_LIST_ID}/items` +
    '?$top=500&$expand=fields($select=EmployeeID,ColleagueName,Position,Section,Department,IsActive)';

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`fetchColleagues failed: ${await res.text()}`);
    const data = await res.json() as {
      value: Array<{ id: string; fields: Record<string, unknown> }>;
      '@odata.nextLink'?: string;
    };

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
        isActive: Boolean(f.IsActive),
      });
    }

    url = data['@odata.nextLink'] ?? null;
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    return new Response(
      JSON.stringify({ error: 'Missing Azure credentials: set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET as Supabase secrets.' }),
      { status: 503, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const token = await getAppToken();
    const colleagues = await fetchColleagues(token);
    return new Response(JSON.stringify(colleagues), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-read-colleagues error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
