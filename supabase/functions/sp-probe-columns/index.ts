import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerEmail } from '../_shared/auth.ts';

// THROWAWAY DIAGNOSTIC — DELETE THIS FUNCTION ONCE IT HAS ANSWERED.
//
// It exists to answer one question before the Colleagues_Master trainer field is
// implemented: what is the INTERNAL name of the ColleagueAccount Person column?
// Graph reads a Person column as `<internalName>LookupId`, and an internal name
// diverges from the display name whenever a column is renamed after creation.
// `$select` on a name that does not exist ERRORS rather than returning null, so a
// wrong guess would take the whole colleague read down for every user — which is
// why this is a probe and not an assumption. See
// docs/superpowers/specs/2026-08-03-trainer-field-from-colleagues-master-design.md.
//
// Deliberately not added to scripts/deploy-sp-function.sh's allow-list: it is not
// part of the application, and the shared deploy path should not learn about it
// only to forget it again. scripts/probe-colleague-columns.sh deploys and calls it.
//
// READ-ONLY. One GET against a list's column definitions. It writes nothing, and
// it touches no mirror — a diagnostic that mutates state is not a diagnostic.

interface GraphColumn {
  name: string;
  displayName?: string;
  description?: string;
  readOnly?: boolean;
  hidden?: boolean;
  required?: boolean;
  // Type facets are mutually exclusive on Graph's columnDefinition; the one that
  // is present IS the type. personOrGroup is the one that matters here.
  personOrGroup?: { allowMultipleSelection?: boolean; chooseFromType?: string };
  lookup?: unknown;
  text?: unknown;
  note?: unknown;
  number?: unknown;
  choice?: unknown;
  boolean?: unknown;
  dateTime?: unknown;
}

const FACETS = [
  'personOrGroup',
  'lookup',
  'text',
  'note',
  'number',
  'choice',
  'boolean',
  'dateTime',
] as const;

function facetOf(column: GraphColumn): string {
  for (const facet of FACETS) {
    if (column[facet] !== undefined) return facet;
  }
  return 'unknown';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  if (!haveAzureCreds()) {
    return json(req, { error: 'Missing Azure credentials.' }, 503);
  }

  // Same gate as every other sp-* function. A diagnostic is not a reason to
  // publish an unauthenticated endpoint that enumerates SharePoint schema.
  const caller = await getCallerEmail(req);
  if (!caller) {
    return json(req, { error: 'Not authenticated.' }, 401);
  }

  const requested = new URL(req.url).searchParams.get('list') ?? 'colleagues';
  if (!Object.prototype.hasOwnProperty.call(LIST_IDS, requested)) {
    // hasOwnProperty, not `in`: indexing a plain object with a caller-controlled
    // string would otherwise resolve inherited Object.prototype members.
    return json(req, { error: `Unknown list "${requested}". One of: ${Object.keys(LIST_IDS).join(', ')}` }, 400);
  }
  const listId = LIST_IDS[requested as keyof typeof LIST_IDS];

  try {
    const token = await getAppToken();
    const siteId = await getSiteId(token);
    // No $select. The question is what EXISTS, and $select on a guessed name is
    // the very failure this probe is meant to avoid making in production code.
    const data = await graphFetch<{ value: GraphColumn[] }>(
      token,
      `${GRAPH_BASE}/sites/${siteId}/lists/${listId}/columns`,
    );

    const columns = data.value.map((column) => ({
      name: column.name,
      displayName: column.displayName ?? null,
      type: facetOf(column),
      // For a Person column: what a write must send, and whether it takes a
      // collection. Both decide the shape of the submit payload.
      readsAs: column.personOrGroup || column.lookup ? `${column.name}LookupId` : column.name,
      allowMultipleSelection: column.personOrGroup?.allowMultipleSelection ?? null,
      chooseFromType: column.personOrGroup?.chooseFromType ?? null,
      hidden: column.hidden ?? false,
      readOnly: column.readOnly ?? false,
      required: column.required ?? false,
    }));

    const personColumns = columns.filter((column) => column.type === 'personOrGroup');

    return json(req, {
      list: requested,
      listId,
      columnCount: columns.length,
      // Lifted out because it is the entire question being asked.
      personColumns,
      columns,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-probe-columns error:', message);
    return json(req, { error: message }, 500);
  }
});
