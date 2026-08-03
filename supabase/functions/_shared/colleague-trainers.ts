// Turning Colleagues_Master rows into the LookupIds a People Picker write needs.
//
// WHY THIS IS THE WHOLE DESIGN. TrainerName_x002e_ accepts only User Information
// List item ids. Colleagues_Master carries a Person column, ColleagueAccount, whose
// stored value IS such an id — Graph reads it as ColleagueAccountLookupId (internal
// name confirmed unmangled by probe on 2026-08-03). So a trainer resolves by id,
// end to end, and no name or address is ever compared.
//
// That matters because both alternatives were refuted by this tenant's own data:
//   - Name matching: "Amir Monir" (account display name) is "Amir Gerges Daoud" in
//     Colleagues_Master. One person, two names, no shared token but "Amir".
//   - Deriving a login from an address: the tenant signs in with firstname + the
//     surname's first initial (ahmed.mokhtar -> ahmedm), which is consistent and
//     STILL unusable, because it is not injective — ahmed.mokhtar and ahmed.mansour
//     both give ahmedm. A collision resolves to a different real person, silently.
// See docs/superpowers/specs/2026-08-03-trainer-field-from-colleagues-master-design.md.
//
// Zero imports and no Deno APIs, so `node --test` can run the tests without a Deno
// runtime — the same reason uil-mapper.ts is shaped this way.

export interface ColleagueTrainerRow {
  employeeId: string;
  colleagueName: string;
  isActive: boolean;
  // null means "no usable account link", which is a refusal, never a guess.
  accountLookupId: number | null;
}

// SharePoint Yes/No columns normally return a JSON boolean; mirrors the defensive
// parse in sp-read-colleagues so the two cannot disagree about what "active" means.
function parseActive(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }
  return false;
}

// Graph returns a lookup id as a number or a string depending on the column and the
// request shape, and omits the property entirely when the column is empty.
//
// A single-element ARRAY is accepted too. ColleagueAccount is single-select
// (allowMultipleSelection: false, confirmed by probe), so an array should not
// appear — but if the column is ever switched to multi-select, reading the one
// element keeps every trainer resolvable, whereas refusing would take the whole
// feature down for everyone at once. Anything else is null: a refusal the user can
// act on beats an id we guessed.
export function parseAccountLookupId(raw: unknown): number | null {
  const scalar = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : undefined) : raw;
  if (typeof scalar !== 'number' && typeof scalar !== 'string') return null;
  const value = typeof scalar === 'string' ? scalar.trim() : scalar;
  if (value === '') return null;
  const id = Number(value);
  // Number('') is 0 and Number('12abc') is NaN — both must fail. A LookupId is a
  // positive integer; 0 is SharePoint's "empty", not a valid item.
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Reads one Colleagues_Master item's `fields` object. Returns null only when the
// row carries no employee id, which is the one field a trainer cannot be looked up
// without.
export function mapColleagueTrainerRow(
  fields: Record<string, unknown>,
  accountFieldName = 'ColleagueAccountLookupId',
): ColleagueTrainerRow | null {
  const employeeId = String(fields.EmployeeID ?? '').trim();
  if (!employeeId) return null;

  return {
    employeeId,
    colleagueName: String(fields.ColleagueName ?? '').trim(),
    isActive: parseActive(fields.IsActive),
    accountLookupId: parseAccountLookupId(fields[accountFieldName]),
  };
}

// The current client's trainer field, cleaned. null means "this client did not send
// employee ids", which is how a not-yet-redeployed client falls through to the legacy
// email path — so a malformed entry must also return null rather than silently
// dropping one trainer and submitting the rest.
//
// Lives here, not in the function, so it can be tested: sp-submit-training's index.ts
// cannot be imported by `node --test` (Deno.serve, jsr: specifiers), and the rule
// deciding which resolution path a submission takes is not something to leave
// unexercised.
export function normalizeTrainerEmployeeIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const cleaned: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' && typeof entry !== 'number') return null;
    const employeeId = String(entry).trim();
    if (!employeeId) return null;
    if (!cleaned.includes(employeeId)) cleaned.push(employeeId);
  }
  return cleaned;
}

// Indexes rows by employee id.
//
// DUPLICATE EMPLOYEE IDS: a re-hired colleague can have two rows, typically one
// inactive without an account and one active with. Plain first-wins would refuse a
// perfectly valid trainer depending on list order, so a row that is active AND
// linked displaces one that is not. Beyond that, first wins.
export function indexColleaguesByEmployeeId(
  rows: ColleagueTrainerRow[],
): Map<string, ColleagueTrainerRow> {
  const byId = new Map<string, ColleagueTrainerRow>();
  for (const row of rows) {
    const existing = byId.get(row.employeeId);
    if (!existing) {
      byId.set(row.employeeId, row);
      continue;
    }
    const existingUsable = existing.isActive && existing.accountLookupId !== null;
    const candidateUsable = row.isActive && row.accountLookupId !== null;
    if (candidateUsable && !existingUsable) byId.set(row.employeeId, row);
  }
  return byId;
}

// Maps requested employee ids to LookupIds. Every id either yields a LookupId or a
// refusal naming the person and the reason — never a silent omission, because a
// training filed against a shorter trainer list than the user chose is a wrong
// record that nothing surfaces.
export function resolveTrainerIdsByEmployeeId(
  rows: ColleagueTrainerRow[],
  employeeIds: string[],
): { ids: number[]; refusals: string[] } {
  const byId = indexColleaguesByEmployeeId(rows);
  const ids: number[] = [];
  const refusals: string[] = [];

  for (const employeeId of employeeIds) {
    const row = byId.get(employeeId);
    if (!row) {
      // Covers a shared or role mailbox with no colleague record at all, as well as
      // a stale draft naming someone since deleted.
      refusals.push(`employee ID ${employeeId} is not in the colleague list`);
      continue;
    }
    const who = row.colleagueName ? `${row.colleagueName} (${employeeId})` : `employee ID ${employeeId}`;
    if (!row.isActive) {
      refusals.push(`${who} is not an active colleague`);
      continue;
    }
    if (row.accountLookupId === null) {
      refusals.push(`${who} has no linked account in Colleagues_Master`);
      continue;
    }
    // Deduped by id, not by employee id: two colleague rows could legitimately point
    // at one account, and SharePoint rejects a Person collection with repeats.
    if (!ids.includes(row.accountLookupId)) ids.push(row.accountLookupId);
  }

  return { ids, refusals };
}
