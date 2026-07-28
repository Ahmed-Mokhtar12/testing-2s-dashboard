import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerEmail } from '../_shared/auth.ts';

// Graph API v1.0's columnDefinition has NO `typeAsString` property; a
// column's type is expressed as mutually-exclusive facets on the column
// object (`text`, `note`, `number`, `choice`, `boolean`, `dateTime`, ...).
// `locationTypeAsString`/`remarksTypeAsString` are derived from those facets
// (see columnTypeFromFacets), so when the SharePoint schema changes — e.g.
// field_5/field_7 switch between Number and Text — the new type flows through
// automatically without a code change here or on the client. `trainers` is
// still always [] because TrainerName_x002e_ is a People Picker (Person
// columns expose no `choice.choices` via Graph); the key is kept for
// response-shape stability, but the client no longer consumes it.
interface GraphColumn {
  name: string;
  text?: unknown;
  note?: unknown;
  number?: unknown;
  choice?: { choices: string[] };
}

// Derives the column type from Graph's mutually-exclusive facets. When no
// recognized facet is present, default to 'Text': a text input can safely
// carry any value the user types (and the Supabase mirror stores it as
// text), whereas wrongly forcing a number input blocks legitimate input.
function columnTypeFromFacets(column?: GraphColumn): 'Number' | 'Text' {
  if (column?.number !== undefined) return 'Number';
  if (column?.text !== undefined || column?.note !== undefined) return 'Text';
  return 'Text';
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
      locationTypeAsString: columnTypeFromFacets(locationCol),
      remarksTypeAsString: columnTypeFromFacets(remarksCol),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-read-columns error:', message);
    return json(req, { error: message }, 500);
  }
});
