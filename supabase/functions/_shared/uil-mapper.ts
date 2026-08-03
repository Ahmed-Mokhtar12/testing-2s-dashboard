// Pure mapping from a raw SharePoint User Information List (UIL) item to a
// trainer entry, or null for non-person rows (SharePoint groups, system
// accounts, and anything else the UIL surfaces that carries no email-like
// identity). Zero imports, no Deno APIs — importable from plain Node so the
// unit tests can run under `npx tsx --test` without a Deno runtime.
//
// The UIL is the same list sp-submit-training resolves trainer LookupIds
// against; sourcing the dropdown from it means every option the frontend can
// offer is guaranteed resolvable at submit time.

export interface UilTrainer {
  id: string;
  displayName: string;
  mail: string;
}

// Mirrors sp-submit-training's extractIdentityKeys: which UIL field carries
// the identity varies with how the user was materialized on the site. EMail
// is frequently EMPTY for users added via group membership / directory sync,
// while the login lives in a claims string in Name and/or UserName (e.g.
// "i:0#.f|membership|x@y.com"), and some tenants expose UserPrincipalName.
// Only a value that looks like an email (contains "@") is accepted; the
// first field to yield one wins.
function extractEmail(fields: Record<string, unknown>): string | null {
  const asEmail = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    return v.includes('@') ? v : null;
  };

  const direct = asEmail(fields.EMail);
  if (direct) return direct;

  for (const claims of [fields.Name, fields.UserName]) {
    if (typeof claims !== 'string') continue;
    const raw = claims.trim();
    // Claims format: take the substring after the LAST "|"; a plain value
    // (no "|") is used as-is when it contains "@".
    const candidate = raw.includes('|') ? raw.slice(raw.lastIndexOf('|') + 1) : raw;
    const email = asEmail(candidate);
    if (email) return email;
  }

  return asEmail(fields.UserPrincipalName);
}

// Maps one raw UIL item (its `fields` object, plus the item's own id) to a
// trainer entry. Returns null when the item carries no email-like identity
// value — the signal that this row is not a real person (e.g. a SharePoint
// group or system row).
export function mapUilItemToTrainer(
  itemId: string | number,
  fields: Record<string, unknown>,
): UilTrainer | null {
  const mail = extractEmail(fields);
  if (!mail) return null;

  const title = typeof fields.Title === 'string' ? fields.Title.trim() : '';
  // Title (the UIL's display-name field) is expected for every real person
  // row; fall back to the email so a row is never dropped purely for a
  // missing display name.
  const displayName = title || mail;

  return { id: String(itemId), displayName, mail };
}

// Dedupe by lowercased mail (first occurrence wins — the same "first wins"
// semantics sp-submit-training's UIL scan uses) and sort by displayName for
// a stable, predictable dropdown order.
export function dedupeAndSortTrainers(trainers: UilTrainer[]): UilTrainer[] {
  const byMail = new Map<string, UilTrainer>();
  for (const t of trainers) {
    // Lowercase defensively at the dedupe key even though mapUilItemToTrainer
    // already lowercases mail — this helper's contract ("dedupe by lowercased
    // mail") should hold regardless of what the caller passes in.
    const key = t.mail.trim().toLowerCase();
    if (!byMail.has(key)) byMail.set(key, t);
  }
  return Array.from(byMail.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}
