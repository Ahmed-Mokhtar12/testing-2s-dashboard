import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, graphFetch, GRAPH_BASE } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerEmail } from '../_shared/auth.ts';

interface TrainerRef {
  displayName: string;
  email: string;
}

// The tenant directory changes rarely; warm isolates skip the multi-page
// walk entirely and serve straight from this cache.
const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: { data: TrainerRef[]; fetchedAt: number } | null = null;

async function fetchTrainers(token: string): Promise<TrainerRef[]> {
  const byEmail = new Map<string, TrainerRef>();

  let url: string | null =
    `${GRAPH_BASE}/users?$select=id,displayName,mail,userPrincipalName,accountEnabled&$top=999`;

  while (url) {
    const data = await graphFetch<{
      value: Array<{
        id: string;
        displayName?: string | null;
        mail?: string | null;
        userPrincipalName?: string | null;
        accountEnabled?: boolean | null;
      }>;
      '@odata.nextLink'?: string;
    }>(token, url);

    for (const u of data.value) {
      if (u.accountEnabled === false) continue;

      const displayName = u.displayName?.trim();
      const email = (u.mail ?? u.userPrincipalName ?? '').trim().toLowerCase();
      if (!displayName || !email) continue;

      if (!byEmail.has(email)) {
        byEmail.set(email, { displayName, email });
      }
    }

    url = data['@odata.nextLink'] ?? null;
  }

  return Array.from(byEmail.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
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
    const trainers = await fetchTrainers(token);
    cache = { data: trainers, fetchedAt: Date.now() };
    return json(req, trainers);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-read-trainers error:', message);
    return json(req, { error: message }, 500);
  }
});
