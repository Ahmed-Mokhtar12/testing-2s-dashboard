import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerEmail } from '../_shared/auth.ts';
import { writeMirror } from '../_shared/mirror.ts';
import {
  DIRECTORY_SELECT,
  mergeTrainerSources,
  toTrainerEntries,
  type DirectoryUser,
  type TrainerEntry,
} from '../_shared/directory.ts';
import { fetchTrainersFromUil } from '../_shared/uil.ts';

// The staff list served to the trainer picker: the tenant directory filtered to
// people who look like staff, UNION every user already in the SharePoint site's
// User Information List (UIL).
//
// THIS DELIBERATELY REVERSES 4b1079b, which moved the dropdown from the directory
// to the UIL. That commit gave two reasons and both are now answered:
//
//   "the dropdown offered shared/role accounts"      -> the staff filter drops them
//                                                       (isLikelyStaff in _shared/directory.ts)
//   "and colleagues who never visited the site ...   -> they are still offered, but
//    failed at submit with Trainer(s) not found"        marked inSite: false, and the
//                                                       picker refuses to select them
//                                                       instead of failing at submit
//
// The UNION is the load-bearing part. A person already in the site whose directory
// record has neither a job title nor a department would be dropped by the filter,
// yet they are recordable TODAY — so they are restored here and appear in the
// ordinary list. Without the union they would need the wider search to be found at
// all, which would be absurd for someone already usable.
//
// See docs/superpowers/specs/2026-08-03-trainer-directory-escape-hatch-design.md.
const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: { data: TrainerEntry[]; fetchedAt: number } | null = null;

// Every enabled directory user, paged to exhaustion. $top=999 is Graph's maximum
// for /users; a tenant larger than one page still works via @odata.nextLink.
async function fetchDirectory(token: string): Promise<DirectoryUser[]> {
  const users: DirectoryUser[] = [];
  let url: string | null = `${GRAPH_BASE}/users?$select=${DIRECTORY_SELECT}&$top=999`;

  while (url) {
    const data = await graphFetch<{
      value: DirectoryUser[];
      '@odata.nextLink'?: string;
    }>(token, url);
    users.push(...data.value);
    url = data['@odata.nextLink'] ?? null;
  }

  return users;
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

    // Both walks, in parallel: they are independent and the UIL is one page while
    // the directory is one or two, so serialising them would add a round trip to
    // the slowest call on the page for nothing.
    //
    // THE DIRECTORY READ IS ALLOWED TO FAIL. It is the new half of this function,
    // and it needs a Graph permission (User.Read.All) that the UIL read does not.
    // If it ever breaks — permission revoked, tenant throttling — an empty
    // directory merges to exactly the UIL, which is precisely this function's
    // behaviour before today. Degrading to the old list beats 500-ing a page that
    // was working an hour ago; the reason lands in the logs.
    const [directoryResult, siteTrainers] = await Promise.all([
      fetchDirectory(token).catch((err: unknown) => {
        console.error(
          'sp-read-trainers: directory read failed, falling back to the site list only:',
          err instanceof Error ? err.message : String(err),
        );
        return [] as DirectoryUser[];
      }),
      fetchTrainersFromUil(token, siteId),
    ]);
    const directoryUsers = directoryResult;

    const trainers = mergeTrainerSources(
      toTrainerEntries(directoryUsers, { staffOnly: true }),
      siteTrainers,
    );
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
