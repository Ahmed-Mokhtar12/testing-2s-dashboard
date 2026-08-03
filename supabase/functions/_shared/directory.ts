// Pure logic shared by sp-read-trainers (the staff list) and sp-search-directory
// (the escape hatch). Design: docs/superpowers/specs/2026-08-03-trainer-directory-escape-hatch-design.md
//
// WHY IT LIVES IN _shared AND IS PURE: both functions need it, and each function's
// deploy archives only its own directory plus _shared, so a cross-function import
// would break the git-archive deploy. Nothing here touches Deno, the network or the
// clock, so it runs in the hermetic `node --test` gate — the same reason
// sp-submit-training/participant-batch.ts is its own file.

export interface DirectoryUser {
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  accountEnabled?: boolean | null;
  jobTitle?: string | null;
  department?: string | null;
}

export interface TrainerEntry {
  displayName: string;
  email: string;
  // Whether this person exists in the SharePoint site's User Information List, and
  // therefore whether sp-submit-training can resolve a LookupId for them TODAY.
  // false does not mean "not a real person" — it means "not recordable yet".
  inSite: boolean;
  // Shown beside a wider-search result so the picker can tell two people with the
  // same name apart. Absent for UIL-sourced entries, which carry no job data.
  jobTitle?: string;
}

// The Graph $select every caller needs. One constant so the read path and the
// search path cannot drift into asking for different fields and then disagreeing
// about who counts as staff.
export const DIRECTORY_SELECT =
  'displayName,mail,userPrincipalName,accountEnabled,jobTitle,department';

// Minimum query length for the wider search. One character would match a large
// fraction of the directory and makes the tokenised match meaningless.
export const MIN_SEARCH_LENGTH = 2;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// mail is null for accounts with no mailbox alias set, but userPrincipalName is
// always present and is what the UIL indexes as the login. sp-submit-training
// matches on exactly these, so falling back here keeps the two consistent.
export function directoryEmail(user: DirectoryUser): string | null {
  const email = text(user.mail) || text(user.userPrincipalName);
  return email.includes('@') ? email.toLowerCase() : null;
}

// THE STAFF HEURISTIC, and it is a heuristic: real staff whose directory record has
// neither a job title nor a department are excluded. That risk was accepted
// deliberately, and it is bounded by the UIL union in mergeTrainerSources — anyone
// who has ever used the Training Record site is kept regardless, because having
// used the site is evidence rather than a guess.
//
// Its purpose is to keep service and shared mailboxes ("Night Auditor",
// "Materials Administrator", "2Seasons AI - Sera") out of a picker the training
// team uses monthly. Those accounts almost never carry job data; real staff almost
// always do.
export function isLikelyStaff(user: DirectoryUser): boolean {
  return Boolean(text(user.jobTitle) || text(user.department));
}

// Directory users -> trainer entries, dropping everyone who could not be recorded
// or displayed: disabled accounts, no display name, no email-shaped identity.
// `staffOnly` is false for the wider search, where reaching past the filter is the
// entire point.
export function toTrainerEntries(
  users: DirectoryUser[],
  opts: { staffOnly: boolean },
): TrainerEntry[] {
  const entries: TrainerEntry[] = [];
  for (const user of users) {
    if (user.accountEnabled === false) continue;

    const displayName = text(user.displayName);
    const email = directoryEmail(user);
    if (!displayName || !email) continue;
    if (opts.staffOnly && !isLikelyStaff(user)) continue;

    const jobTitle = text(user.jobTitle);
    entries.push({
      displayName,
      email,
      // Directory membership says nothing about site membership. Callers overwrite
      // this from the UIL; defaulting to false keeps "not recordable" the safe
      // answer if a caller ever forgets.
      inSite: false,
      ...(jobTitle ? { jobTitle } : {}),
    });
  }
  return entries;
}

// Marks entries whose email appears in the site's User Information List.
export function markInSite(entries: TrainerEntry[], siteEmails: Iterable<string>): TrainerEntry[] {
  const inSite = new Set<string>();
  for (const email of siteEmails) {
    const normalised = text(email).toLowerCase();
    if (normalised) inSite.add(normalised);
  }
  return entries.map((entry) => ({ ...entry, inSite: inSite.has(entry.email) }));
}

// The staff list: filtered directory UNION the entire UIL, deduped by email.
//
// The union is what makes the operator's first sub-case vanish. Someone present in
// the site but filtered out by the heuristic (blank jobTitle AND department) is
// restored here, so they appear in the ordinary list and the local filter finds
// them — no wider search needed, and they are submittable today.
//
// UIL entries win a collision. Both sides carry the same name and email; only the
// UIL side carries the fact that decides whether they can be recorded.
export function mergeTrainerSources(
  directory: TrainerEntry[],
  site: TrainerEntry[],
): TrainerEntry[] {
  const byEmail = new Map<string, TrainerEntry>();
  for (const entry of directory) {
    byEmail.set(entry.email, { ...entry, inSite: false });
  }
  for (const entry of site) {
    const existing = byEmail.get(entry.email);
    // Keep the directory's job title when the UIL has none — it is only there to
    // disambiguate two people with the same name, and the UIL never supplies it.
    byEmail.set(entry.email, {
      ...entry,
      inSite: true,
      ...(entry.jobTitle || !existing?.jobTitle ? {} : { jobTitle: existing.jobTitle }),
    });
  }
  return Array.from(byEmail.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

// Builds the $search value for GET /users.
//
// CITED, NOT RECALLED — https://learn.microsoft.com/en-us/graph/search-query-parameter
// gives the users example verbatim as:
//     ../users?$search="displayName:Guthr" OR "mail:Guthr"
// and states three things this depends on:
//   1. `ConsistencyLevel: eventual` is REQUIRED for directoryObject collections.
//      The caller must send it; without it Graph rejects the request.
//   2. Each clause is "<property>:<text>", the whole clause wrapped in double
//      quotes, with `"` and `\` escaped by a backslash and everything else URL
//      encoded. AND/OR must be uppercase and outside the quotes.
//   3. Matching is TOKENISED, NOT SUBSTRING. Input and property are split on
//      spaces, case transitions and symbols, then tokens match in any order. So
//      "moh" finds the token "Mohammad" but "hammad" does NOT. The UI empty state
//      has to say this, or a user concludes the person does not exist.
export function buildUserSearchClause(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length < MIN_SEARCH_LENGTH) {
    throw new Error(`Search needs at least ${MIN_SEARCH_LENGTH} characters.`);
  }
  // Backslash first, or escaping the quote would then escape its own backslash.
  const escaped = trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"displayName:${escaped}" OR "mail:${escaped}"`;
}

// The claims login SharePoint's _api/web/ensureuser expects for an Entra ID member.
// Lowercased because the UIL indexes the login lowercased and sp-submit-training
// matches on that.
export function membershipClaim(email: string): string {
  const normalised = text(email).toLowerCase();
  if (!normalised.includes('@')) {
    throw new Error(`Not an email-shaped identity: "${email}"`);
  }
  return `i:0#.f|membership|${normalised}`;
}
