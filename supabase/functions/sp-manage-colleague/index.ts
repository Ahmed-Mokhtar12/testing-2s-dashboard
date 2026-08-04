import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerEmail } from '../_shared/auth.ts';
import { invalidateMirror } from '../_shared/mirror.ts';
import { collapseColleagueFields } from '../_shared/text.ts';

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

interface ColleaguePatch {
  colleagueName: string;
  position: string;
  section: string;
  department: string;
  reactivate?: boolean;
}

type Body =
  | { action: 'add'; colleague: NewColleague }
  | { action: 'deactivate'; itemId: string }
  | { action: 'update'; itemId: string; patch: ColleaguePatch };

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
      const raw = body.colleague;
      if (!raw?.employeeId || !/^\d+$/.test(raw.employeeId)) return json(req, { error: 'Employee ID must be numeric.' }, 400);
      if (!raw.colleagueName?.trim() || !raw.position?.trim() || !raw.section?.trim() || !raw.department?.trim()) {
        return json(req, { error: 'All colleague fields are required.' }, 400);
      }

      // COLLAPSE BEFORE WRITING. The guard above trims only to decide whether a field is
      // empty and then, until 2026-08-04, the RAW value was written one line later — so
      // this form was itself a source of the whitespace dirt that the trainer-name
      // contract, the report's dedupe and Sera's participant search all have to cope
      // with. Six of 336 rows were affected. `trim()` sitting next to an unnormalised
      // write is the whole defect.
      const c = collapseColleagueFields(raw);

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
      // Every successful write here changes what sp-read-colleagues would return,
      // so the Postgres mirror must be dropped or the client's post-mutation
      // invalidateQueries(['colleagues']) would re-read the list from BEFORE this
      // change — the member the admin just added would not appear, and refreshing
      // would not help until the mirror aged out.
      await invalidateMirror('colleagues');
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
      await invalidateMirror('colleagues');
      return json(req, { ok: true });
    }

    if (body.action === 'update') {
      const itemId = body.itemId?.trim();
      if (!itemId || !/^\d+$/.test(itemId)) {
        return json(req, { error: 'itemId must be a numeric SharePoint item id.' }, 400);
      }
      const rawPatch = body.patch;
      if (!rawPatch?.colleagueName?.trim() || !rawPatch.position?.trim() || !rawPatch.section?.trim() || !rawPatch.department?.trim()) {
        return json(req, { error: 'All colleague fields are required.' }, 400);
      }
      // Same rule as the add branch, and it has to be in BOTH: an edit is how five of
      // the six dirty rows would most plausibly have been created in the first place.
      const p = collapseColleagueFields(rawPatch);
      const fields: Record<string, unknown> = {
        Title: p.colleagueName,
        ColleagueName: p.colleagueName,
        Position: p.position,
        Section: p.section,
        Department: p.department,
      };
      // update can only ever reactivate — deactivation stays a separate action
      if (p.reactivate) fields.IsActive = true;
      await graphFetch(
        token,
        `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.colleagues}/items/${itemId}/fields`,
        { method: 'PATCH', body: JSON.stringify(fields) },
      );
      await invalidateMirror('colleagues');
      return json(req, { ok: true });
    }

    return json(req, { error: 'Unknown action.' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-manage-colleague error:', message);
    return json(req, { error: message }, 500);
  }
});
