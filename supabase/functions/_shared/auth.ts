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
