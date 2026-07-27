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
