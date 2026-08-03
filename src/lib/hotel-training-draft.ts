import type { Colleague, ParticipantRow, TrainingDetailsValues } from '@/types/hotel-training';

// Reading a saved localStorage draft back into the wizard.
//
// Replaces migrateLegacyTrainerDraft, which mapped retired plain-string trainer
// names through FALLBACK_TRAINERS. Both that constant and the shape it produced are
// gone: trainers are now colleagues, so there is nothing to map a bare name ONTO
// without guessing, and guessing which colleague a name means is the unreliable
// join this whole change exists to refute (docs/superpowers/specs/
// 2026-08-03-trainer-field-is-the-participant-picker-design.md).
//
// So anything not already in the new shape is DROPPED and the user is told. Losing a
// trainer selection costs one click; recording the wrong person costs a wrong record
// that nothing in this system reads back and therefore nothing would ever surface.
//
// PURE, and it TAKES NO COLLEAGUE LIST — the trap (T-D) is re-resolving these entries
// against `colleagues`. Restore always lands on step 1, where the colleague read may
// still be in flight and the list is `[]`, so a validating version would report that
// every trainer had been removed, on exactly the path someone takes when something has
// already gone wrong.

export interface ReconciledDraft {
  /** The details to seed the form with, or null when the draft held none. */
  details: Partial<TrainingDetailsValues> | null;
  /**
   * The participant rows. `length` is always the stored length — a conflicting row is
   * cleared to `null`, never spliced out, because the wizard's invariant is
   * `participants.length === totalParticipants`.
   */
  participants: ParticipantRow[];
  /** What was changed and why, in the user's words. Empty when nothing was. */
  notices: string[];
}

const COLLEAGUE_TEXT_FIELDS = [
  'id',
  'employeeId',
  'colleagueName',
  'position',
  'section',
  'department',
] as const;

// Strict on purpose: every field of Colleague, right type, and the two the wire and
// the exclusion rule depend on non-empty. A partially-shaped object would type-check
// as a Colleague after the cast below and then render a blank badge or submit an empty
// name.
//
// `isActive` is taken from the draft rather than re-checked, which means a colleague
// deactivated since the draft was saved is still restorable as a trainer. That is the
// accepted cost of taking no colleague list; the badge is on screen at step 1, so the
// stale name is in front of the person who saved it.
function isColleague(value: unknown): value is Colleague {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;
  if (typeof record.isActive !== 'boolean') return false;
  for (const field of COLLEAGUE_TEXT_FIELDS) {
    if (typeof record[field] !== 'string') return false;
  }

  return (record.employeeId as string).trim() !== '' && (record.colleagueName as string).trim() !== '';
}

// A human-readable label for something being dropped, so the notice can name it.
// Covers every shape a trainer has ever been stored as: a Colleague, the retired
// TrainerRef (`displayName`), and a bare name string.
function describeRejected(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of ['colleagueName', 'displayName', 'name', 'email']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
  }

  return null;
}

function rejectionNotice(rejected: unknown[]): string {
  const named = rejected.map(describeRejected).filter((label): label is string => label !== null);
  const unnamed = rejected.length - named.length;

  const parts: string[] = [];
  if (named.length > 0) parts.push(named.map((label) => `"${label}"`).join(', '));
  if (unnamed > 0) parts.push(`${unnamed} unreadable ${unnamed === 1 ? 'entry' : 'entries'}`);

  const subject = rejected.length === 1 ? 'one trainer' : `${rejected.length} trainers`;
  return (
    `This draft saved ${subject} in a format the form no longer uses (${parts.join(' and ')}). `
    + 'Trainers are now chosen from the colleague list — please select them again.'
  );
}

export function reconcileDraft(raw: unknown): ReconciledDraft {
  const notices: string[] = [];
  const draft = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  // Rebuilt rather than reused, so the caller's parsed object is never mutated.
  const storedRows = Array.isArray(draft.participants) ? draft.participants : [];
  const participants: ParticipantRow[] = storedRows.map((entry, index) => {
    const row = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    const rowNo = Number.isInteger(row.rowNo) ? (row.rowNo as number) : index + 1;
    return { rowNo, colleague: isColleague(row.colleague) ? { ...row.colleague } : null };
  });

  if (typeof draft.trainingDetails !== 'object' || draft.trainingDetails === null) {
    return { details: null, participants, notices };
  }

  const details = { ...(draft.trainingDetails as Record<string, unknown>) };
  const rejected: unknown[] = [];

  // The retired structural trainer key. Detected by shape rather than by name because
  // the identifier itself is retired and naming it here would resurrect it in a grep.
  //
  // Only ARRAY values are stripped. A future `trainerNotes: string` must survive this
  // function, and the old version's "array of strings" test would also have deleted
  // it had it ever held one.
  for (const key of Object.keys(details)) {
    if (key === 'trainers' || !key.startsWith('trainer')) continue;
    const value = details[key];
    if (!Array.isArray(value)) continue;

    delete details[key];
    rejected.push(...value);
  }

  const trainers: Colleague[] = [];
  const seenTrainerIds = new Set<string>();
  for (const entry of Array.isArray(details.trainers) ? details.trainers : []) {
    if (!isColleague(entry)) {
      rejected.push(entry);
      continue;
    }
    // A hand-edited draft could name one colleague twice; the picker cannot. Two
    // badges with the same React key is the visible symptom.
    if (seenTrainerIds.has(entry.employeeId)) continue;
    seenTrainerIds.add(entry.employeeId);
    trainers.push({ ...entry });
  }
  details.trainers = trainers;

  if (rejected.length > 0) {
    notices.push(rejectionNotice(rejected));
  }

  // Overlap: THE TRAINER WINS and the participant row is cleared.
  //
  // Restore lands on step 1 with the trainer badges on screen, and zod requires at
  // least one trainer — so clearing the trainer instead would block Next with no
  // trace of why. An empty participant row announces itself; a silently removed
  // trainer does not.
  const cleared: string[] = [];
  for (let index = 0; index < participants.length; index += 1) {
    const colleague = participants[index].colleague;
    if (!colleague || !seenTrainerIds.has(colleague.employeeId)) continue;

    participants[index] = { ...participants[index], colleague: null };
    cleared.push(`row ${participants[index].rowNo} (${colleague.colleagueName})`);
  }

  if (cleared.length > 0) {
    notices.push(
      `A colleague cannot be a trainer and a participant on the same session. Cleared ${cleared.join(', ')} `
      + '— pick someone else for those rows, or drop them as a trainer.',
    );
  }

  // The cast is the same one migrateLegacyTrainerDraft made: `date` is still the ISO
  // string localStorage held, and the caller revives it. Everything this function
  // claims to have validated — the trainers array — really is validated above.
  return { details: details as Partial<TrainingDetailsValues>, participants, notices };
}
