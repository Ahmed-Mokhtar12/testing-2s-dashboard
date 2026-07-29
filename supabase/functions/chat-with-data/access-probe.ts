import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

export type EmptyKind = 'no_records_found' | 'records_not_visible' | 'no_visible_records_unverified';

// Called ONLY after a user-scoped query returned zero rows. applyFilters MUST
// re-apply the exact filters of the user-scoped query. Service role is used
// solely for a HEAD count (existence), never row contents.
export async function classifyEmptyResult(table: string, applyFilters: (q: any) => any): Promise<EmptyKind> {
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { count, error } = await applyFilters(admin.from(table).select('*', { count: 'exact', head: true }));
    if (error) return 'no_visible_records_unverified';
    return (count ?? 0) > 0 ? 'records_not_visible' : 'no_records_found';
  } catch {
    return 'no_visible_records_unverified';
  }
}

// Generic wording by design (user decision): naming WHO can see the data
// would re-encode the RLS policy in copy and drift when the policy changes.
export function emptyResultPayload(kind: EmptyKind, extra: Record<string, unknown> = {}): string {
  const notes: Record<EmptyKind, string> = {
    no_records_found: 'No records exist for this query. Tell the user plainly that none were logged for the period.',
    records_not_visible: "Records exist for this query but are not visible to this user's account. Tell the user this data is not visible to their account and an authorized colleague can check it. Do NOT say or imply the records do not exist.",
    no_visible_records_unverified: 'No records are visible to this account and existence could not be verified. Tell the user no records are visible to their account. Do NOT assert that none exist.',
  };
  return JSON.stringify({ status: kind, instruction_to_model: notes[kind], ...extra });
}
