import { supabase } from '@/integrations/supabase/client';
import { isMirrorFresh, type MirrorKey } from '@/lib/sharepoint-mirror';

// Reads a payload out of public.sharepoint_mirror, the Postgres copy that
// sp-read-* writes on every successful Graph read. PostgREST is always warm, so
// this is a ~100 ms read where invoking the edge function measured 2.6-3.7 s of
// mostly cold start (docs/perf/hotel-training-baseline.md).
//
// Returns null for every reason a caller cannot use the mirror — absent row,
// stale row, RLS refusal, network failure, malformed timestamp — so there is
// exactly one branch to handle and it is the one that already existed: invoke the
// function. That is why this never throws and never reports a reason. A mirror
// problem must degrade performance, never correctness.
export async function readMirror<T>(key: MirrorKey): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('sharepoint_mirror')
      .select('payload, fetched_at')
      .eq('key', key)
      .maybeSingle();

    if (error || !data) return null;
    if (!isMirrorFresh(data.fetched_at, key)) return null;

    return data.payload as T;
  } catch {
    return null;
  }
}

// supabase.functions.invoke wraps a non-2xx response in a FunctionsHttpError
// whose `message` is generic. The real reason lives in the response body.
export async function extractInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      /* response had no JSON body; fall through */
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export async function invokeReadColumns(): Promise<ListColumnsResult> {
  const { data, error } = await supabase.functions.invoke('sp-read-columns');
  if (error) {
    throw new Error(await extractInvokeError(error));
  }
  return data as ListColumnsResult;
}

export interface ListColumnsResult {
  departments: string[];
  locationTypeAsString: string;
  remarksTypeAsString: string;
}

// invokeReadTrainers read the SharePoint site's User Information List for the old
// trainer dropdown. Deleted with that dropdown: the picker reads Colleagues_Master,
// which invokeReadColleagues already serves. The sp-read-trainers FUNCTION is still
// deployed and callable until commit 8 removes it — deleting a caller is not
// undeploying a function.

export interface TrainingSessionPayload {
  title: string;
  department: string;
  durationMinutes: number;
  totalParticipants: number;
  location?: number | string | null;
  remarks?: number | string | null;
  trainingDate: string;
  // Plain `ColleagueName` text, cleaned by src/lib/trainer-names.ts. The edge function
  // writes these to the SharePoint `TrainerNames` text column.
  //
  // NOT `trainerNames`, which the edge function still accepts with incompatible
  // semantics — it 400s anything that is not a key of its TRAINER_EMAILS map. Reusing
  // that name would route a legacy client's trainers into the new column, which is
  // exactly what accepting both shapes exists to prevent. Precedence in the function is
  // trainerColleagueNames -> trainerEmployeeIds -> legacy, never a merge.
  //
  // The legacy `trainers: TrainerRef[]` field is gone from this type but still accepted
  // by the deployed function, so a browser tab holding the previous bundle keeps
  // working until commit 8.
  trainerColleagueNames: string[];
}

export interface ParticipantPayload {
  trainingId: string;
  rowNo: number;
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
}

export type SubmitTrainingRequest = TrainingSessionPayload & {
  trainingId: string;
  participants: ParticipantPayload[];
};

export interface SubmitTrainingResponse {
  sharepointId: string;
  failedParticipants: Array<{ row: ParticipantPayload; error: string }>;
}

export async function invokeSubmitTraining(
  payload: SubmitTrainingRequest,
): Promise<SubmitTrainingResponse> {
  const { data, error } = await supabase.functions.invoke('sp-submit-training', {
    body: payload,
  });
  if (error) {
    throw new Error(await extractInvokeError(error));
  }
  return data as SubmitTrainingResponse;
}

export interface NewColleaguePayload {
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
}

export interface ColleaguePatchPayload {
  colleagueName: string;
  position: string;
  section: string;
  department: string;
  reactivate?: boolean;
}

export type ManageColleagueRequest =
  | { action: 'add'; colleague: NewColleaguePayload }
  | { action: 'deactivate'; itemId: string }
  | { action: 'update'; itemId: string; patch: ColleaguePatchPayload };

export async function invokeManageColleague(
  request: ManageColleagueRequest,
): Promise<{ id?: string; ok?: boolean }> {
  const { data, error } = await supabase.functions.invoke('sp-manage-colleague', {
    body: request,
  });
  if (error) {
    throw new Error(await extractInvokeError(error));
  }
  return data as { id?: string; ok?: boolean };
}
