import type { Colleague } from '@/types/hotel-training';

// The one availability-and-search rule shared by every colleague picker.
//
// WHY IT IS EXTRACTED. The trainer field becomes the participant picker, and "same
// search behaviour" is a stated requirement — so two copies of this predicate drifting
// apart is not an inconsistency, it is a defect the requirement names. Everything else
// about the two controls differs (one row with a clear button versus multi-select
// badges), which is why only this and the option label are shared and the pickers
// themselves are not. See
// docs/superpowers/specs/2026-08-03-trainer-field-is-the-participant-picker-design.md.
//
// Extracted verbatim from ParticipantRow's inline `available` computation, so the
// existing e2e suite is the oracle for it behaving identically.

interface Options {
  /**
   * Employee ids that are unavailable — already chosen on this side or the other.
   */
  exclude?: ReadonlySet<string>;
  /**
   * Employee ids that stay visible even when excluded: a control must always show its
   * OWN current selection, or a filled row would appear empty in its own dropdown.
   * Beats `exclude` deliberately.
   */
  keep?: ReadonlySet<string>;
}

export function filterColleagues(
  colleagues: Colleague[],
  query: string,
  { exclude, keep }: Options = {},
): Colleague[] {
  const needle = query.trim().toLowerCase();

  return colleagues.filter((colleague) => {
    if (!colleague.isActive) return false;

    const available = keep?.has(colleague.employeeId) || !exclude?.has(colleague.employeeId);
    if (!available) return false;

    if (needle === '') return true;
    return (
      colleague.colleagueName.toLowerCase().includes(needle) ||
      // Lowercased on BOTH sides. Employee ids are numeric today, so this cannot change
      // any current result — but the previous inline version compared the raw id against
      // a raw query, which would have failed on the first alphanumeric id anyone added.
      colleague.employeeId.toLowerCase().includes(needle)
    );
  });
}
