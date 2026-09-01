// Pure parser for the OAuth callback URL, unit-tested. supabase-js runs the IMPLICIT flow by
// default, so GoTrue returns to /auth/callback with the result in the HASH (#access_token=…
// or #error=…&error_description=…), while a PKCE flow would use ?code= / ?error=. Read both.
export interface CallbackUrlFacts {
  hasResult: boolean;
  error: string | null;
  description: string | null;
}

export function parseCallbackUrl(search: string, hash: string): CallbackUrlFacts {
  const s = new URLSearchParams(search.replace(/^\?/, ''));
  const h = new URLSearchParams(hash.replace(/^#/, ''));
  const error = s.get('error') || h.get('error');
  return {
    hasResult: s.has('code') || h.has('access_token') || Boolean(error),
    error,
    description: s.get('error_description') || h.get('error_description'),
  };
}
