import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerEmail } from '../_shared/auth.ts';
import { writeMirror } from '../_shared/mirror.ts';
import { mapUilItemToTrainer, dedupeAndSortTrainers } from './uil-mapper.ts';

interface TrainerRef {
  displayName: string;
  email: string;
}

// The site's User Information List (UIL) changes rarely; warm isolates skip
// the multi-page walk entirely and serve straight from this cache.
//
// Sourced from the UIL rather than the whole tenant directory: the dropdown
// must equal the set sp-submit-training can actually resolve trainers
// against (it addresses the same UIL_LIST_ID — see that function). Listing
// the full Graph /users directory let people pick shared/role accounts or
// colleagues who never visited the SharePoint site, which then failed at
// submit with "Trainer(s) not found on the SharePoint site."
const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: { data: TrainerRef[]; fetchedAt: number } | null = null;

async function fetchTrainersFromUil(token: string, siteId: string): Promise<TrainerRef[]> {
  const mapped: Array<ReturnType<typeof mapUilItemToTrainer>> = [];

  // Deliberately no $select on fields: UIL internal field names vary by
  // tenant and $select on a missing field can error, so fetch the full field
  // set and read defensively in uil-mapper (mirrors sp-submit-training).
  let url: string | null =
    `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.uil}/items?$top=500&$expand=fields`;

  while (url) {
    const data = await graphFetch<{
      value: Array<{ id: string; fields: Record<string, unknown> }>;
      '@odata.nextLink'?: string;
    }>(token, url);

    for (const item of data.value) {
      mapped.push(mapUilItemToTrainer(item.id, item.fields));
    }

    url = data['@odata.nextLink'] ?? null;
  }

  const persons = mapped.filter((t): t is NonNullable<typeof t> => t !== null);
  return dedupeAndSortTrainers(persons).map((t) => ({ displayName: t.displayName, email: t.mail }));
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
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
      return json(req, cache.data);
    }

    const token = await getAppToken();
    const siteId = await getSiteId(token);
    const trainers = await fetchTrainersFromUil(token, siteId);
    cache = { data: trainers, fetchedAt: Date.now() };
    // Only on a real UIL walk, not on the in-memory cache hit above: the mirror
    // already holds that same payload, and rewriting it would push fetched_at
    // forward without the data having been re-read from Graph.
    await writeMirror('trainers', trainers);
    return json(req, trainers);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-read-trainers error:', message);
    return json(req, { error: message }, 500);
  }
});
