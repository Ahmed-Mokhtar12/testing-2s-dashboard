import { createClient } from 'jsr:@supabase/supabase-js@2';

// verify_jwt=true means the gateway already validated the JWT signature;
// this resolves the caller to a live auth user and returns their email.
export async function getCallerEmail(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;
  return data.user.email.toLowerCase();
}

// Same JWT resolution as getCallerEmail, but also returns the auth user id
// so callers can scope writes/reads (e.g. RLS-checked inserts) to the caller.
export async function getCallerUser(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email.toLowerCase() };
}

export type StaffCaller = { id: string; email: string };

// Authentication is not authorization. Since 20260730140000 a new account gets no role,
// so "resolvable auth user" includes accounts that every RLS policy denies — such an
// account could still drive Sera, read the colleague roster and write to SharePoint
// (audit E7, E9-M2). Resolve the caller, then ask the same function the policies use.
export async function requireStaff(
  req: Request,
): Promise<{ ok: true; caller: StaffCaller } | { ok: false; status: 401 | 403; error: string }> {
  const caller = await getCallerUser(req);
  if (!caller) return { ok: false, status: 401, error: 'Not authenticated.' };
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.rpc('is_hotel_staff', { _user_id: caller.id });
  if (error || !data) return { ok: false, status: 403, error: 'Forbidden: hotel staff only.' };
  return { ok: true, caller };
}

export async function requireAdmin(
  req: Request,
): Promise<{ ok: true; caller: StaffCaller } | { ok: false; status: 401 | 403; error: string }> {
  const staff = await requireStaff(req);
  if (!staff.ok) return staff;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.rpc('has_role', { _user_id: staff.caller.id, _role: 'admin' });
  if (error || !data) return { ok: false, status: 403, error: 'Forbidden: admins only.' };
  return staff;
}
