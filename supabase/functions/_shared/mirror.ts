// Write-through to public.sharepoint_mirror, the Postgres copy of the three
// SharePoint read results. See the migration
// (supabase/migrations/20260802230000_sharepoint_mirror.sql) for why the mirror
// exists and why it is a write-through rather than a scheduled job.
//
// NOTHING IN HERE MAY FAIL A READ. Every function that calls this has already
// done the expensive, useful work — fetched real data from Graph and is about to
// return it. A mirror write that threw would turn a successful read into a 500,
// which is strictly worse than having no mirror at all. So both functions swallow
// their own failures and report them to the log, and neither returns a value the
// caller has to check. That is a deliberate exception to "never ignore an error",
// and it is the reason the frontend treats a missing or stale mirror as normal.
//
// Plain fetch rather than the supabase-js client: this only ever does one upsert
// or one delete, and the functions that import it already pay for a supabase-js
// instance in _shared/auth.ts for a different key. There is nothing here worth a
// second client for.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// Set automatically for every edge function. Writes require it: the mirror grants
// no INSERT/UPDATE/DELETE to anon or authenticated, and the service role bypasses
// RLS.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export type MirrorKey = 'colleagues' | 'trainers' | 'columns';

function endpoint(query = ''): string {
  return `${SUPABASE_URL}/rest/v1/sharepoint_mirror${query}`;
}

function serviceHeaders(): Record<string, string> {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Replaces the stored payload for `key`. fetched_at is NOT sent: the table's
// trigger stamps it, which is what makes the freshness check on the client
// trustworthy even though this body only carries two columns.
export async function writeMirror(key: MirrorKey, payload: unknown): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(`mirror: cannot write "${key}", SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is unset`);
    return;
  }

  try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        ...serviceHeaders(),
        // Upsert on the primary key, and do not ask for the row back.
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ key, payload }),
    });

    if (!res.ok) {
      console.error(`mirror: write "${key}" failed ${res.status}: ${await res.text().catch(() => '')}`);
    }
  } catch (err) {
    console.error(`mirror: write "${key}" threw:`, err instanceof Error ? err.message : String(err));
  }
}

// Drops the stored payload so the next read goes to Graph. Called after a write
// that changes what the mirror would return — adding, editing or removing a
// colleague. Without it, the frontend's post-mutation invalidateQueries(['colleagues'])
// would re-read the mirror and get the list from BEFORE the change: the member
// the user just added would not appear, and refreshing would not help until the
// mirror aged out.
export async function invalidateMirror(key: MirrorKey): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(`mirror: cannot invalidate "${key}", SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is unset`);
    return;
  }

  try {
    const res = await fetch(endpoint(`?key=eq.${encodeURIComponent(key)}`), {
      method: 'DELETE',
      headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
    });

    if (!res.ok) {
      console.error(`mirror: invalidate "${key}" failed ${res.status}: ${await res.text().catch(() => '')}`);
    }
  } catch (err) {
    console.error(`mirror: invalidate "${key}" threw:`, err instanceof Error ? err.message : String(err));
  }
}
