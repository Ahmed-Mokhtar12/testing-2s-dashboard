// Trainer names as plain text, for the Monthly_Training `TrainerNames` column.
//
// WHY PLAIN TEXT. Any active colleague can be a trainer, and most have no Microsoft
// account — so there is nothing to resolve to a LookupId and the Person column
// `TrainerName_x002e_` cannot represent them. See
// docs/superpowers/specs/2026-08-03-trainer-field-is-the-participant-picker-design.md.
//
// WHY THE FORMAT IS DEFINED HERE AND NOT INFERRED. Three writers put values in that
// column — this app, possibly the Monthly_Training PowerApp, and a hand-typed
// backfill — and NOTHING in this system reads it back. A divergence between writers
// would sit there silently forever, because no code path would ever compare them. So
// the format is a stated contract, and this module is its only implementation on our
// side.
//
// Zero imports and no Deno APIs, so `node --test` can run the tests without a Deno
// runtime — the same reason uil-mapper.ts is shaped this way.

// A semicolon and exactly one space. Not a comma: a comma can legitimately appear
// inside a person's name and a semicolon effectively cannot. It is also how SharePoint
// itself renders a multi-value Person field, so a TrainerNames value reads natively in
// the list view and a backfilled row is indistinguishable from a new one.
export const TRAINER_NAMES_SEPARATOR = '; ';

// The column is Text (single line): 255 characters. Confirmed by probe 2026-08-03.
// The write refuses beyond this rather than letting SharePoint truncate silently —
// a truncated trainer list is a wrong record that nothing surfaces.
export const MAX_TRAINER_NAMES_LENGTH = 255;

// A cheap bound on a hostile body, checked before any string work. The length limit
// above is the one that binds in practice (20 names at ~25 characters is already
// double 255), so this exists to stop 10,000 entries being normalised at all.
export const MAX_TRAINER_COUNT = 20;

// Runs of whitespace collapse to a single space, then trim.
//
// NOT cosmetic. Colleagues_Master carries its own whitespace dirt — one live row is
// "Muhammed Muhammed  Zawahir" with a double space, and a position of " IT Manager"
// with a leading one. The monthly report dedupes trainer names with
// raw.trim().toLowerCase(), which treats "A  B" and "A B" as two different trainers,
// so propagating invisible characters would leave the report one stray SharePoint edit
// away from silently splitting one person into two.
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// The client's trainer field, cleaned. null means "this client did not send trainer
// names", which is how a not-yet-redeployed client falls through to the legacy paths.
//
// A malformed entry therefore rejects the WHOLE field rather than dropping one name:
// submitting two of the three trainers someone chose is a wrong record that nothing
// surfaces, whereas falling through produces a 400 they can act on. Same contract, and
// same reasoning, as normalizeTrainerEmployeeIds.
export function normalizeTrainerNames(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (raw.length > MAX_TRAINER_COUNT) return null;

  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') return null;
    const name = collapseWhitespace(entry);
    if (!name) return null;
    // Case-insensitive dedupe keeping the FIRST spelling: the picker cannot offer one
    // colleague twice, so a repeat means a malformed or hand-built body, and silently
    // writing "X; X" would make the list read as two trainers.
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(name);
  }
  return cleaned.length > 0 ? cleaned : null;
}

// Returns an error message, or null when the names will fit. Separate from
// normalizeTrainerNames because "too long to store" must produce a clear 400 naming the
// limit, not a fall-through to the legacy path and a misleading "no valid trainer".
export function trainerNamesTooLong(names: string[]): string | null {
  const value = formatTrainerNames(names);
  if (value.length <= MAX_TRAINER_NAMES_LENGTH) return null;
  return (
    `${names.length} trainer names need ${value.length} characters, ` +
    `but the SharePoint TrainerNames column holds ${MAX_TRAINER_NAMES_LENGTH}. ` +
    'Record fewer trainers on this session.'
  );
}

// The value written to the column. Selection order is preserved deliberately — it is
// the order the person chose, and sorting would make a backfilled row differ from a new
// one for no gain.
export function formatTrainerNames(names: string[]): string {
  return names.join(TRAINER_NAMES_SEPARATOR);
}
