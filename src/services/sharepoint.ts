import { supabase } from '@/integrations/supabase/client';

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
  trainers: string[];
  locationTypeAsString: string;
  remarksTypeAsString: string;
}

export interface TrainingSessionPayload {
  title: string;
  department: string;
  durationMinutes: number;
  totalParticipants: number;
  location?: number | string | null;
  remarks?: number | string | null;
  trainingDate: string;
  trainerNames: string[];
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

export type ManageColleagueRequest =
  | { action: 'add'; colleague: NewColleaguePayload }
  | { action: 'deactivate'; itemId: string };

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
