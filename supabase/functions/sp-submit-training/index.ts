import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { haveAzureCreds, getAppToken, getSiteId, graphFetch, GRAPH_BASE, LIST_IDS } from '../_shared/graph.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import {
  formatTrainerNames,
  normalizeTrainerNames,
  trainerNamesTooLong,
} from '../_shared/trainer-names.ts';
import { getCallerEmail } from '../_shared/auth.ts';
import { writeParticipantsInBatches, type BatchResponse } from './participant-batch.ts';

interface ParticipantRow {
  rowNo: number;
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
}

interface SubmitBody {
  trainingId: string;
  title: string;
  department: string;
  durationMinutes: number;
  totalParticipants: number;
  location: string | number | null;
  remarks: string | number | null;
  trainingDate: string;
  // THE ONLY SHAPE. Colleague names as plain text, written to the TrainerNames column.
  // Any active colleague can be a trainer and most have no Microsoft account, so there
  // is nothing to resolve — see _shared/trainer-names.ts.
  //
  // Three earlier shapes were accepted here and all three are now gone: `trainers`
  // (displayName + email, resolved against the site's User Information List),
  // `trainerNames` (mapped through a hardcoded three-name table), and
  // `trainerEmployeeIds` (resolved through ColleagueAccount). Each existed to obtain a
  // person LookupId for the TrainerName_x002e_ Person column, and that column is frozen:
  // it is never written now, because a session with one account-holder and one colleague
  // without would have shown one trainer of two.
  trainerColleagueNames: unknown;
  participants: ParticipantRow[];
}

// Maximum participants in one session. Raised 15 -> 100 on 2026-08-01.
//
// MUST equal MAX_PARTICIPANTS in src/lib/hotel-training-constants.ts. It cannot
// simply import it: this is the Deno tree, both tsconfigs exclude it, and an
// import across the runtime boundary would break the git archive the deploy
// scripts build. So the two are checked against each other instead —
// tests/unit/participant-cap-agrees.test.ts fails the build if they disagree.
//
// This gate is the one that matters: a form accepting 100 while this rejects
// anything over 15 means a wizard the user can fill and cannot submit.
const MAX_PARTICIPANTS = 100;

function badRequest(body: SubmitBody, haveTrainers: boolean): string | null {
  if (!body.trainingId || !/^TRN-\d{14}$/.test(body.trainingId)) return 'Invalid trainingId.';
  if (!body.title?.trim()) return 'Title is required.';
  if (!body.department?.trim()) return 'Department is required.';
  if (!Number.isFinite(body.durationMinutes) || body.durationMinutes <= 0) return 'Invalid duration.';
  if (!Number.isInteger(body.totalParticipants) || body.totalParticipants < 1 || body.totalParticipants > MAX_PARTICIPANTS) {
    return `Total participants must be between 1 and ${MAX_PARTICIPANTS}.`;
  }
  if (!haveTrainers) return 'At least one valid trainer is required.';
  if (!body.trainingDate || Number.isNaN(Date.parse(body.trainingDate))) return 'Invalid training date.';
  if (!Array.isArray(body.participants) || body.participants.length === 0) return 'At least one participant is required.';
  if (body.participants.length !== body.totalParticipants) {
    return `Participant count mismatch: expected ${body.totalParticipants}, got ${body.participants.length}.`;
  }
  // rowNo is now the $batch correlation id, so it MUST be unique: Graph rejects
  // a batch containing two requests with the same id, and a duplicate would also
  // make one row's result silently stand in for another's when failures are
  // mapped back. The client generates rowNo as index+1 so this cannot currently
  // happen, but the function must not depend on that.
  if (new Set(body.participants.map((row) => row.rowNo)).size !== body.participants.length) {
    return 'Participant rowNo values must be unique.';
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

  // One shape, so no precedence to resolve. normalizeTrainerNames fails closed —
  // anything malformed yields null and the 400 below names the problem — which is why
  // this can sit outside the try/catch that follows.
  const trainerColleagueNames = normalizeTrainerNames(body.trainerColleagueNames);

  const invalid = badRequest(body, Boolean(trainerColleagueNames));
  if (invalid) {
    return json(req, { error: invalid }, 400);
  }

  // Checked here rather than inside normalizeTrainerNames: "too long to store" must
  // produce a 400 naming the limit, not a fall-through to the legacy path and a
  // misleading "no valid trainer".
  if (trainerColleagueNames) {
    const tooLong = trainerNamesTooLong(trainerColleagueNames);
    if (tooLong) return json(req, { error: tooLong }, 400);
  }

  try {
    const token = await getAppToken();
    const siteId = await getSiteId(token);

    // TrainerNames only. Plain text, no Graph read, nothing to resolve — and NOTHING
    // written to TrainerName_x002e_, which is frozen with its historical values intact.
    //
    // This used to be a three-branch precedence chain ending in a UIL scan and an
    // ensureuser call. All of it existed to turn a person into a LookupId, and the
    // requirement that any of 336 colleagues can train made that impossible: most have
    // no Microsoft account, so there is no id to find.
    const value = formatTrainerNames(trainerColleagueNames!);
    console.log(`sp-submit-training: TrainerNames=${trainerColleagueNames!.length} name(s), ${value.length} chars`);
    const trainerFields: Record<string, unknown> = { TrainerNames: value };

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
            ...trainerFields,
          },
        }),
      },
    );

    // One $batch per 20 rows, instead of one awaited POST per row. See
    // participant-batch.ts for the reasoning: SharePoint throttles list-write
    // bursts, and each 429 costs a Retry-After wait PER CALL, so at 100
    // participants the sequential loop could exceed the 400s edge-function wall
    // clock and return a 504 with SharePoint half-written.
    const batchFailures = await writeParticipantsInBatches(
      body.participants.map((row) => ({
        rowNo: row.rowNo,
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
      })),
      // Sub-request URLs inside a $batch are relative to the version root and
      // must NOT carry the https://graph.microsoft.com/v1.0 prefix.
      `/sites/${siteId}/lists/${LIST_IDS.participants}/items`,
      async (requests) => {
        const data = await graphFetch<{ responses?: BatchResponse[] }>(
          token,
          `${GRAPH_BASE}/$batch`,
          { method: 'POST', body: JSON.stringify({ requests }) },
        );
        return data?.responses ?? [];
      },
    );

    // Response contract is deliberately unchanged — { row, error } per failure —
    // so the frontend's partial-write handling and its regression test keep
    // working without knowing that batching happened.
    const failedParticipants: Array<{ row: ParticipantRow; error: string }> = [];
    const byRowNo = new Map(body.participants.map((row) => [row.rowNo, row]));
    for (const failure of batchFailures) {
      const row = byRowNo.get(failure.rowNo);
      if (row) failedParticipants.push({ row, error: failure.error });
    }

    return json(req, { sharepointId: session.id, failedParticipants });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('sp-submit-training error:', message);
    return json(req, { error: message }, 500);
  }
});
