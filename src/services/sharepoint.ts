import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  MONTHLY_TRAINING_LIST_ID,
  PARTICIPANTS_LIST_ID,
  COLLEAGUES_LIST_ID,
  SP_SITE_HOST,
  SP_SITE_PATH,
} from '@/lib/hotel-training-constants';
import type { Colleague } from '@/types/hotel-training';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

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

let cachedSiteId: string | null = null;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function graphRequest<T = unknown>(
  token: string,
  url: string,
  options: RequestInit = {},
  retryCount = 0,
  did401Retry = false,
): Promise<T> {
  let res: Response;

  try {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    res = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('No connection. Your draft is saved.');
      throw new Error('NETWORK_OFFLINE');
    }
    throw err;
  }

  if (res.status === 429) {
    if (retryCount >= 3) {
      throw new Error('SharePoint throttling: max retries exceeded');
    }

    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '10', 10);
    toast.message('SharePoint is busy, retrying…');
    await delay(retryAfter * 1000);
    return graphRequest<T>(token, url, options, retryCount + 1, did401Retry);
  }

  if (res.status === 401) {
    if (did401Retry) {
      toast.error('Session expired — please sign in again.');
      throw new Error('SESSION_EXPIRED');
    }

    const { data, error } = await supabase.auth.refreshSession();
    const newToken = data.session?.provider_token;

    if (error || !newToken) {
      toast.error('Session expired — please sign in again.');
      throw new Error('SESSION_EXPIRED');
    }

    return graphRequest<T>(newToken, url, options, retryCount, true);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Graph API ${res.status}: ${text}`);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function getSiteId(token: string): Promise<string> {
  if (cachedSiteId) {
    return cachedSiteId;
  }

  const data = await graphRequest<{ id: string }>(
    token,
    `${GRAPH_BASE}/sites/${SP_SITE_HOST}:${SP_SITE_PATH}`,
  );
  cachedSiteId = data.id;
  return cachedSiteId;
}

export function resetSiteIdCache() {
  cachedSiteId = null;
}

export interface ListColumnsResult {
  departments: string[];
  trainers: string[];
  locationTypeAsString: string;
  remarksTypeAsString: string;
}

export async function getListColumns(token: string): Promise<ListColumnsResult> {
  const siteId = await getSiteId(token);
  const data = await graphRequest<{
    value: Array<{ name: string; typeAsString?: string; choice?: { choices: string[] } }>;
  }>(token, `${GRAPH_BASE}/sites/${siteId}/lists/${MONTHLY_TRAINING_LIST_ID}/columns`);

  const find = (name: string) => data.value.find((column) => column.name === name);
  const deptCol = find('field_1');
  const trainerCol = find('TrainerName_x002e_');
  const locationCol = find('field_5');
  const remarksCol = find('field_7');

  return {
    departments: deptCol?.choice?.choices ?? [],
    trainers: trainerCol?.choice?.choices ?? [],
    locationTypeAsString: locationCol?.typeAsString ?? 'Number',
    remarksTypeAsString: remarksCol?.typeAsString ?? 'Number',
  };
}

export async function getColleagues(token: string): Promise<Colleague[]> {
  const siteId = await getSiteId(token);
  const results: Colleague[] = [];
  let url: string | null =
    `${GRAPH_BASE}/sites/${siteId}/lists/${COLLEAGUES_LIST_ID}/items` +
    '?$top=500&$expand=fields($select=EmployeeID,ColleagueName,Position,Section,Department,IsActive)';

  while (url) {
    const data = await graphRequest<{
      value: Array<{ id: string; fields: Record<string, unknown> }>;
      '@odata.nextLink'?: string;
    }>(token, url);

    for (const item of data.value) {
      const fields = item.fields;
      const rawDepartment = fields.Department;
      const department =
        rawDepartment && typeof rawDepartment === 'object'
          ? String((rawDepartment as { Value?: string }).Value ?? '')
          : String(rawDepartment ?? '');

      results.push({
        id: item.id,
        employeeId: String(fields.EmployeeID ?? ''),
        colleagueName: String(fields.ColleagueName ?? ''),
        position: String(fields.Position ?? ''),
        section: String(fields.Section ?? ''),
        department,
        isActive: Boolean(fields.IsActive),
      });
    }

    url = data['@odata.nextLink'] ?? null;
  }

  return results;
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

export async function createTrainingSession(
  token: string,
  data: TrainingSessionPayload,
): Promise<string> {
  const siteId = await getSiteId(token);
  const result = await graphRequest<{ id: string }>(
    token,
    `${GRAPH_BASE}/sites/${siteId}/lists/${MONTHLY_TRAINING_LIST_ID}/items`,
    {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Title: data.title,
          field_1: data.department,
          field_4: data.durationMinutes,
          field_5: data.location ?? null,
          field_6: data.totalParticipants,
          field_7: data.remarks ?? null,
          field_8: data.trainingDate,
          TrainerName_x002e_: data.trainerNames,
        },
      }),
    },
  );

  return result.id;
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

export interface CreateParticipantsResult {
  succeeded: ParticipantPayload[];
  failed: Array<{ row: ParticipantPayload; error: string }>;
}

export async function createParticipants(
  token: string,
  rows: ParticipantPayload[],
): Promise<CreateParticipantsResult> {
  const siteId = await getSiteId(token);
  const succeeded: ParticipantPayload[] = [];
  const failed: Array<{ row: ParticipantPayload; error: string }> = [];

  for (const row of rows) {
    try {
      await graphRequest(
        token,
        `${GRAPH_BASE}/sites/${siteId}/lists/${PARTICIPANTS_LIST_ID}/items`,
        {
          method: 'POST',
          body: JSON.stringify({
            fields: {
              Title: row.colleagueName,
              TrainingID: row.trainingId,
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
      succeeded.push(row);
    } catch (err) {
      failed.push({ row, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeeded, failed };
}

export interface NewColleaguePayload {
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
}

export async function createColleague(token: string, data: NewColleaguePayload): Promise<string> {
  const siteId = await getSiteId(token);
  const result = await graphRequest<{ id: string }>(
    token,
    `${GRAPH_BASE}/sites/${siteId}/lists/${COLLEAGUES_LIST_ID}/items`,
    {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Title: data.colleagueName,
          EmployeeID: data.employeeId,
          ColleagueName: data.colleagueName,
          Position: data.position,
          Section: data.section,
          Department: data.department,
          IsActive: true,
        },
      }),
    },
  );

  return result.id;
}

export async function patchColleague(
  token: string,
  itemId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const siteId = await getSiteId(token);
  await graphRequest(
    token,
    `${GRAPH_BASE}/sites/${siteId}/lists/${COLLEAGUES_LIST_ID}/items/${itemId}/fields`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
}
