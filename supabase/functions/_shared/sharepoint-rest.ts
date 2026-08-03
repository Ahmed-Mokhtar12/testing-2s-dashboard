import { membershipClaim } from './directory.ts';

// SharePoint's own REST API, for the one thing Graph cannot do.
//
// WHY THIS EXISTS. Graph writes a Person column only by User Information List
// LookupId (`TrainerName_x002e_LookupId`). There is no write-by-email. A directory
// user who has never touched the site has no id, so they cannot be recorded — not
// because of a filter we chose, but because there is nothing to write. The only way
// to mint one is SharePoint's `_api/web/ensureuser`, which materialises the account
// as a site user and returns its UIL Id.
//
// AND IT NEEDS A DIFFERENT TOKEN. `_api` rejects Graph tokens outright. It wants a
// token whose audience is the SharePoint resource, which means the Azure app needs a
// SHAREPOINT application permission (Sites.Manage.All, or Sites.FullControl.All if
// Manage proves insufficient) with tenant admin consent — separate from every Graph
// permission the app already holds.
//
// THAT CONSENT IS NOT IN PLACE YET, which is the whole reason this module reports
// "unavailable" as a distinct outcome rather than throwing. Callers must degrade to
// the behaviour they had before it existed. See
// docs/superpowers/specs/2026-08-03-trainer-directory-escape-hatch-design.md.

const TENANT_ID = Deno.env.get('AZURE_TENANT_ID') ?? '';
const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET') ?? '';

// Three outcomes, not two, because the caller must treat them differently:
//   ok          -> we have a LookupId, carry on
//   unavailable -> the permission is not granted; behave exactly as before
//   failed      -> the permission works but this person could not be ensured
export type EnsureUserResult =
  | { status: 'ok'; lookupId: number }
  | { status: 'unavailable'; reason: string }
  | { status: 'failed'; reason: string };

// Cached per isolate like the Graph token, and for the same reason: one app, one
// resource, ~1 h lifetime. Null means "asked and was refused" — cached separately so
// a missing permission costs one token call per isolate rather than one per trainer.
let cachedToken: { value: string; expiresAt: number } | null = null;
let tokenRefused: string | null = null;

const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;

async function getSharePointToken(host: string): Promise<{ token: string } | { refused: string }> {
  if (tokenRefused !== null) return { refused: tokenRefused };
  if (cachedToken && Date.now() < cachedToken.expiresAt) return { token: cachedToken.value };

  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        // The SharePoint resource, NOT graph.microsoft.com. This is the line that
        // needs the separate application permission.
        scope: `https://${host}/.default`,
      }).toString(),
    },
  );

  if (!res.ok) {
    // Almost always AADSTS65001 / invalid_scope: no SharePoint permission granted.
    // Remembered for the isolate's life so a 100-participant submission naming three
    // unknown trainers does not make three identical failing token calls.
    tokenRefused = `SharePoint token refused (${res.status}): ${await res.text().catch(() => '')}`;
    return { refused: tokenRefused };
  }

  const body = await res.json();
  const token = body.access_token as string;
  const seconds = Number(body.expires_in);
  if (token && Number.isFinite(seconds) && seconds * 1000 > TOKEN_SAFETY_MARGIN_MS) {
    cachedToken = { value: token, expiresAt: Date.now() + seconds * 1000 - TOKEN_SAFETY_MARGIN_MS };
  }
  return { token };
}

// Materialises `email` as a user of the site and returns its User Information List
// Id — the LookupId a Person column write needs.
export async function ensureSiteUser(
  host: string,
  sitePath: string,
  email: string,
): Promise<EnsureUserResult> {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    return { status: 'unavailable', reason: 'Azure credentials are not configured.' };
  }

  let logonName: string;
  try {
    logonName = membershipClaim(email);
  } catch (err) {
    return { status: 'failed', reason: err instanceof Error ? err.message : String(err) };
  }

  const auth = await getSharePointToken(host);
  if ('refused' in auth) {
    return { status: 'unavailable', reason: auth.refused };
  }

  const res = await fetch(`https://${host}${sitePath}/_api/web/ensureuser`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      // nometadata keeps the response small; the only field wanted is Id.
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
    },
    body: JSON.stringify({ logonName }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // 401/403 means the token was accepted by the token endpoint but SharePoint
    // itself refuses the operation — a narrower permission than ensureuser needs.
    // Still "unavailable" rather than "failed": nothing about THIS person is wrong,
    // so the caller should degrade rather than blame the trainer.
    if (res.status === 401 || res.status === 403) {
      return {
        status: 'unavailable',
        reason: `SharePoint refused ensureuser (${res.status}). The app likely needs Sites.Manage.All or Sites.FullControl.All: ${body}`,
      };
    }
    return { status: 'failed', reason: `ensureuser ${res.status}: ${body}` };
  }

  const body = await res.json().catch(() => null);
  const lookupId = Number((body as { Id?: unknown } | null)?.Id);
  if (!Number.isInteger(lookupId) || lookupId <= 0) {
    return { status: 'failed', reason: `ensureuser returned no usable Id: ${JSON.stringify(body)}` };
  }

  return { status: 'ok', lookupId };
}
