import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getCallerEmail } from '../_shared/auth.ts';

interface ParticipantRow {
  rowNo: number;
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
}

type TrainerRef = { displayName: string; email: string };

interface SubmitBody {
  trainingId: string;
  title: string;
  department: string;
  durationMinutes: number;
  totalParticipants: number;
  location: string | number | null;
  remarks: string | number | null;
  trainingDate: string;
  trainers?: TrainerRef[];
  // deprecated: legacy clients — remove after client rollout
  trainerNames?: string[];
  participants: ParticipantRow[];
}

// TrainerName_x002e_ is a multi-select People Picker; trainers must be written
// as person LookupIds, resolved via the site's hidden User Information List.
// The three trainers are the three admins. MUST stay in sync with
// TRAINER_OPTIONS / ADMIN_EMAILS in src/lib/hotel-training-constants.ts.
const TRAINER_EMAILS: Record<string, string> = {
  'Ahmed Mokhtar': 'ahmed.mokhtar@2seasonshotels.com',
  'Amir Monir': 'amir.monir@2seasonshotels.com',
  'Xarmaigne Narciso': 'xarmaigne.narciso@2seasonshotels.com',
};

// Site's hidden User Information List id — discovered empirically via a
// temporary diagnostic deploy (see task report); stable per site.
const UIL_LIST_ID = '265691f8-3786-4e9f-932f-79835f30a6cf';

// Module-scope cache: persists across requests for the lifetime of a warm
// Deno isolate, with no invalidation. If a trainer's User Information List
// item is ever deleted and recreated (e.g. the trainer is removed and
// re-added to the site), this cache could serve a stale LookupId until the
// isolate recycles. Accepted as self-healing — isolates are short-lived and
// this scenario is rare — rather than adding cache-busting complexity here.
const lookupIdCache = new Map<string, number>();

// Extracts every identity key (lowercased email-like value) carried by a UIL
// item's fields. Which field holds the identity varies with how the user was
// materialized on the site: EMail is frequently EMPTY for users added via
// group membership / directory sync, while the login lives in a claims string
// in Name and/or UserName (e.g. "i:0#.f|membership|x@y.com"), and some
// tenants expose UserPrincipalName. Only values that look like an email
// (contain "@") are indexed.
function extractIdentityKeys(fields: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const pushIfEmail = (value: unknown) => {
    if (typeof value !== 'string') return;
    const v = value.trim().toLowerCase();
    if (v.includes('@')) keys.push(v);
  };
  pushIfEmail(fields.EMail);
  for (const claims of [fields.Name, fields.UserName]) {
    if (typeof claims !== 'string') continue;
    // Claims format: take the substring after the LAST "|"; a plain value
    // (no "|") is used as-is when it contains "@".
    const raw = claims.trim();
    pushIfEmail(raw.includes('|') ? raw.slice(raw.lastIndexOf('|') + 1) : raw);
  }
  pushIfEmail(fields.UserPrincipalName);
  return keys;
}

async function resolveTrainerLookupIds(
  token: string,
  siteId: string,
  trainers: TrainerRef[],
): Promise<{ ids: number[]; unresolved: string[] }> {
  const ids: number[] = [];
  const unresolved: string[] = [];
  const toResolve = trainers.filter((t) => !lookupIdCache.has(t.email));

  let itemsScanned = 0;
  if (toResolve.length > 0) {
    // Deliberately no $select on fields: UIL internal field names vary by
    // tenant and $select on a missing field can error, so fetch the full
    // field set and read defensively in extractIdentityKeys.
    let url: string | null =
      `${GRAPH_BASE}/sites/${siteId}/lists/${UIL_LIST_ID}/items` +
      '?$top=500&$expand=fields';
    while (url) {
      const data = await graphFetch<{
        value: Array<{ id: string; fields: Record<string, unknown> }>;
        '@odata.nextLink'?: string;
      }>(token, url);
      for (const item of data.value) {
        itemsScanned += 1;
        for (const key of extractIdentityKeys(item.fields)) {
          // First wins: per item, EMail-derived keys are pushed first, and an
          // earlier item's claim on a key is never overwritten by a later
          // item — so EMail-based matches stay stable.
          if (!lookupIdCache.has(key)) lookupIdCache.set(key, Number(item.id));
        }
      }
      url = data['@odata.nextLink'] ?? null;
    }
  }

  const unresolvedDomains = new Set<string>();
  for (const t of trainers) {
    const id = lookupIdCache.get(t.email);
    if (id === undefined) {
      unresolved.push(t.displayName);
      unresolvedDomains.add(t.email.slice(t.email.lastIndexOf('@') + 1));
    } else {
      ids.push(id);
    }
  }
  if (unresolved.length > 0) {
    // Server-log-only breadcrumb for future diagnosis. Domains only — never
    // full addresses — and the client-facing 400 body is unchanged.
    console.error(
      `sp-submit-training: UIL scan=${itemsScanned} items, keys=${lookupIdCache.size}, ` +
        `unresolved domains=[${[...unresolvedDomains].join(', ')}]`,
    );
  }
  return { ids, unresolved };
}

// Accepts the new TrainerRef[] shape, falling back to legacy trainerNames
// (mapped via TRAINER_EMAILS) for clients not yet redeployed. Returns null
// if neither shape yields a valid, non-empty trainer list.
function normalizeTrainers(body: SubmitBody): TrainerRef[] | null {
  if (Array.isArray(body.trainers) && body.trainers.length > 0) {
    const cleaned: TrainerRef[] = [];
    for (const t of body.trainers) {
      if (!t || typeof t !== 'object') return null;
      const displayName = typeof t.displayName === 'string' ? t.displayName.trim() : '';
      const email = typeof t.email === 'string' ? t.email.trim().toLowerCase() : '';
      if (!displayName || !email.includes('@')) return null;
      cleaned.push({ displayName, email });
    }
    return cleaned;
  }

  if (Array.isArray(body.trainerNames) && body.trainerNames.length > 0) {
    const cleaned: TrainerRef[] = [];
    for (const name of body.trainerNames) {
      // hasOwnProperty guard: TRAINER_EMAILS is a plain object, so indexing it
      // with a caller-controlled string (e.g. "toString", "constructor")
      // would otherwise resolve an inherited Object.prototype member instead
      // of `undefined`, defeating the `!email` check below.
      if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(TRAINER_EMAILS, name)) {
        return null;
      }
      const email = TRAINER_EMAILS[name];
      cleaned.push({ displayName: name, email: email.toLowerCase() });
    }
    return cleaned;
  }

  return null;
}

function badRequest(body: SubmitBody, trainers: TrainerRef[] | null): string | null {
  if (!body.trainingId || !/^TRN-\d{14}$/.test(body.trainingId)) return 'Invalid trainingId.';
  if (!body.title?.trim()) return 'Title is required.';
  if (!body.department?.trim()) return 'Department is required.';
  if (!Number.isFinite(body.durationMinutes) || body.durationMinutes <= 0) return 'Invalid duration.';
  if (!Number.isInteger(body.totalParticipants) || body.totalParticipants < 1 || body.totalParticipants > 15) {
    return 'Total participants must be between 1 and 15.';
  }
  if (!trainers) return 'At least one valid trainer is required.';
  if (!body.trainingDate || Number.isNaN(Date.parse(body.trainingDate))) return 'Invalid training date.';
  if (!Array.isArray(body.participants) || body.participants.length === 0) return 'At least one participant is required.';
  if (body.participants.length !== body.totalParticipants) {
    return `Participant count mismatch: expected ${body.totalParticipants}, got ${body.participants.length}.`;
  }
  return null;
}

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

  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body.' }, 400);
  }

  // Defense in depth: normalizeTrainers is expected to be pure/non-throwing
  // (see the hasOwnProperty guard above), but this call sits outside the
  // main try/catch below — any future regression that reintroduces a throw
  // here must still degrade to a clean 400, not an unhandled crash with no
  // CORS headers.
  let trainers: TrainerRef[] | null;
  try {
    trainers = normalizeTrainers(body);
  } catch {
    trainers = null;
  }
  const invalid = badRequest(body, trainers);
  if (invalid) {
    return json(req, { error: invalid }, 400);
  }

  try {
    const token = await getAppToken();
    const siteId = await getSiteId(token);

    const { ids: trainerIds, unresolved } = await resolveTrainerLookupIds(
      token,
      siteId,
      trainers as TrainerRef[],
    );
    if (unresolved.length > 0) {
      return json(req, {
        error: `Trainer(s) not found on the SharePoint site: ${unresolved.join(', ')}. ` +
          'A trainer must open the Training Record SharePoint site at least once before they ' +
          'can be recorded. Your draft is saved — ask them to visit the site, then submit again.',
      }, 400);
    }

    const session = await graphFetch<{ id: string }>(
      token,
      `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.monthlyTraining}/items`,
      {
        method: 'POST',
        body: JSON.stringify({
          fields: {
            Title: body.title,
            field_1: body.department,
            field_4: body.durationMinutes,
            field_5: body.location ?? null,
            field_6: body.totalParticipants,
            field_7: body.remarks ?? null,
            field_8: body.trainingDate,
            'TrainerName_x002e_LookupId@odata.type': 'Collection(Edm.Int32)',
            TrainerName_x002e_LookupId: trainerIds,
          },
        }),
      },
    );

    const failedParticipants: Array<{ row: ParticipantRow; error: string }> = [];
    for (const row of body.participants) {
      try {
        await graphFetch(
          token,
          `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.participants}/items`,
          {
            method: 'POST',
            body: JSON.stringify({
              fields: {
                Title: row.colleagueName,
                TrainingID: body.trainingId,
                RowNo: row.rowNo,
                EmployeeID: row.employeeId,
                ColleagueName: row.colleagueName,
                Position: row.position,
                Section: row.section,
                Department: row.department,
              },
            }),
          },
        );
      } catch (err) {
        failedParticipants.push({ row, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return json(req, { sharepointId: session.id, failedParticipants });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-submit-training error:', message);
    return json(req, { error: message }, 500);
  }
});
