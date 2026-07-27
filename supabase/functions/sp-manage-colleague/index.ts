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
      const itemId = body.itemId?.trim();
      if (!itemId || !/^\d+$/.test(itemId)) {
        return json(req, { error: 'itemId must be a numeric SharePoint item id.' }, 400);
      }
      await graphFetch(
        token,
        `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.colleagues}/items/${itemId}/fields`,
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
