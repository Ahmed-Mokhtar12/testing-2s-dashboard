import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerEmail } from '../_shared/auth.ts';
import { writeMirror } from '../_shared/mirror.ts';
import { parseAccountLookupId } from '../_shared/colleague-trainers.ts';

interface Colleague {
  id: string;
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
  isActive: boolean;
  // Whether ColleagueAccount is set — i.e. whether this colleague can be recorded
  // as a trainer. A BOOLEAN, deliberately, not the LookupId: the id stays on the
  // server so a client can never send one, and sp-submit-training re-reads it from
  // the colleague's row at submit time. See
  // docs/superpowers/specs/2026-08-03-trainer-field-from-colleagues-master-design.md.
  hasAccount: boolean;
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

// The narrow field list keeps this read small — it runs on page load, and the list
// carries 31 columns of which 7 are wanted.
const FIELD_SELECT =
  'EmployeeID,ColleagueName,Position,Section,Department,IsActive,ColleagueAccountLookupId';

interface GraphItemsPage {
  value: Array<{ id: string; fields: Record<string, unknown> }>;
  '@odata.nextLink'?: string;
}

async function fetchColleagues(token: string): Promise<Colleague[]> {
  const siteId = await getSiteId(token);
  const results: Colleague[] = [];

  const base = `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.colleagues}/items?$top=500`;
  const narrowUrl = `${base}&$expand=fields($select=${FIELD_SELECT})`;

  // A $select naming a field that does not exist ERRORS rather than returning null,
  // and this read gates the whole page. ColleagueAccountLookupId was confirmed by
  // probe on 2026-08-03, but a later rename would take the page down for everyone —
  // so the FIRST request, and only the first, falls back to the full field set. Then
  // hasAccount reads false everywhere and the trainer picker explains itself: a bad
  // day rather than a broken page. Scoped to the first request because that is where
  // a naming error surfaces; a later page failing is a real error and must propagate.
  let url: string | null = narrowUrl;
  let pagesRead = 0;

  while (url) {
    let data: GraphItemsPage;
    try {
      data = await graphFetch<GraphItemsPage>(token, url);
    } catch (err) {
      if (pagesRead > 0 || url !== narrowUrl) throw err;
      console.error(
        'sp-read-colleagues: the narrow $select was rejected, retrying with the full ' +
          'field set. ColleagueAccountLookupId may have been renamed: ' +
          (err instanceof Error ? err.message : String(err)),
      );
      url = `${base}&$expand=fields`;
      continue;
    }
    pagesRead += 1;

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
        // Reuses the submit path's parser, so "linked" cannot mean one thing to the
        // picker and another to the write that has to honour it.
        hasAccount: parseAccountLookupId(f.ColleagueAccountLookupId) !== null,
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
