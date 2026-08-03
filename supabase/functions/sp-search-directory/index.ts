import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerEmail } from '../_shared/auth.ts';
import {
  buildUserSearchClause,
  DIRECTORY_SELECT,
  markInSite,
  MIN_SEARCH_LENGTH,
  toTrainerEntries,
  type DirectoryUser,
} from '../_shared/directory.ts';
import { fetchTrainersFromUil } from '../_shared/uil.ts';

// The trainer picker's escape hatch: search the WHOLE tenant directory, past the
// staff filter sp-read-trainers applies, and report for each match whether it can
// actually be recorded today.
//
// WHY THIS IS A SEPARATE FUNCTION and not a ?search= parameter on sp-read-trainers:
// that function is the page-load path. It holds a single-slot 15-minute in-memory
// cache and its result is mirrored into public.sharepoint_mirror under the key
// 'trainers' (Phase 2). A search response on that path would either overwrite the
// full-list cache, or pollute the mirror row, or need one mirror key per query.
// Search has the opposite cache profile — per query, short-lived, not worth
// persisting — so the two stay apart and the page-load path is untouched.
//
// It is invoked only on a deliberate click, so its cold start (~2-3 s) is paid by a
// user who has already decided to wait, and never on page load.
//
// Design: docs/superpowers/specs/2026-08-03-trainer-directory-escape-hatch-design.md

// Enough to find someone by first or last name without returning a slab of the
// directory. Graph orders $search results by relevance, so the useful matches are
// at the top of these 25.
const MAX_RESULTS = 25;

async function searchDirectory(token: string, query: string): Promise<DirectoryUser[]> {
  const search = buildUserSearchClause(query);
  const url =
    `${GRAPH_BASE}/users` +
    `?$search=${encodeURIComponent(search)}` +
    `&$select=${DIRECTORY_SELECT}` +
    `&$top=${MAX_RESULTS}`;

  const data = await graphFetch<{ value: DirectoryUser[] }>(token, url, {
    // REQUIRED, not optional. learn.microsoft.com/en-us/graph/search-query-parameter:
    // Microsoft Entra resources deriving from directoryObject support $search only in
    // advanced queries, which this header opts into. Without it Graph rejects the
    // request outright rather than degrading to an unfiltered list.
    headers: { ConsistencyLevel: 'eventual' },
  });

  return data.value ?? [];
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

  let body: { q?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body.' }, 400);
  }

  const query = typeof body.q === 'string' ? body.q.trim() : '';
  if (query.length < MIN_SEARCH_LENGTH) {
    return json(
      req,
      { error: `Type at least ${MIN_SEARCH_LENGTH} characters to search the directory.` },
      400,
    );
  }

  try {
    const token = await getAppToken();
    const siteId = await getSiteId(token);

    const [matches, siteTrainers] = await Promise.all([
      searchDirectory(token, query),
      fetchTrainersFromUil(token, siteId),
    ]);

    // staffOnly: false — reaching past the staff filter IS this endpoint. A service
    // account surfacing here is intended: the caller asked for the full directory,
    // and the picker makes choosing one a separate, deliberate act.
    const entries = toTrainerEntries(matches, { staffOnly: false });

    // inSite comes from the UIL, checked here rather than inferred by the client.
    // The client could compare against its loaded staff list — which contains the
    // whole UIL — but that list is served from a mirror up to 60 minutes stale
    // (Phase 2), so it would report "cannot be recorded" for people who can be.
    // A wrong "no" is worse than a cold start: it sends someone to fix a problem
    // that does not exist.
    const results = markInSite(entries, siteTrainers.map((trainer) => trainer.email));

    return json(req, { query, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-search-directory error:', message);
    return json(req, { error: message }, 500);
  }
});
