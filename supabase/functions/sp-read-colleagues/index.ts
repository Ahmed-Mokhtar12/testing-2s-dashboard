import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerEmail } from '../_shared/auth.ts';
import { writeMirror } from '../_shared/mirror.ts';

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

  const caller = await getCallerEmail(req);
  if (!caller) {
    return json(req, { error: 'Not authenticated.' }, 401);
  }

  try {
    const token = await getAppToken();
    const colleagues = await fetchColleagues(token);
    // Awaited, not fire-and-forget: the edge runtime does not guarantee that
    // promises still pending when the response is returned ever run. ~50 ms
    // against a call that measured 2.6-3.7 s.
    await writeMirror('colleagues', colleagues);
    return json(req, colleagues);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-read-colleagues error:', message);
    return json(req, { error: message }, 500);
  }
});
