// supabase/functions/_shared/jwt-role.ts
// Reads the `role` claim from a JWT WITHOUT verifying it. This is safe ONLY behind
// verify_jwt = true, where the Supabase gateway has already checked the signature and
// rejected anything not signed with the project secret. On a verify_jwt = false function
// it is decoration, not authentication. No imports, no Deno globals (unit-tested).
//
// Single-file functions deployed through MCP deploy_edge_function cannot import
// ../_shared, so they carry a byte-identical sibling copy of this file;
// tests/unit/jwt-role-copies-agree.test.ts fails the build if any copy drifts.
export function roleFromAuthorization(header: string | null | undefined): string | null {
  const token = (header ?? '').replace(/^Bearer\s+/i, '').trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const role = JSON.parse(atob(padded))?.role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}
