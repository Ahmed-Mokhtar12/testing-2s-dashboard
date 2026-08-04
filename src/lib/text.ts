// Whitespace normalisation for text that gets STORED, on the frontend side.
//
// A SECOND IMPLEMENTATION of supabase/functions/_shared/text.ts, and the declared-twice
// pattern is deliberate for the same reason as MAX_PARTICIPANTS and the trainer-name
// rule: the edge tree is Deno, both tsconfigs exclude it, and importing across the
// boundary would break the git archive the deploy scripts build.
// tests/unit/colleague-fields-agree.test.ts fails the build when the two disagree.
//
// WHY THE CLIENT APPLIES IT TOO, when the edge function is authoritative. EditMemberForm
// shows a from -> to confirmation dialog and decides whether anything changed at all by
// comparing those values. If only the server normalised, that dialog would state one
// value and the list would store another, and a whitespace-only edit would present as a
// change that then changed nothing. A confirmation screen that misreports what is about
// to happen is worse than no confirmation screen.

// Runs of whitespace collapse to a single space, then trim.
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// The four text fields of a Colleagues_Master row, normalised for storage. All four,
// because position/section/department travel into training_participants exactly as the
// name does — and two of the six dirty rows found on 2026-08-04 were positions, not
// names.
export function collapseColleagueFields<T extends {
  colleagueName: string;
  position: string;
  section: string;
  department: string;
}>(fields: T): T {
  return {
    ...fields,
    colleagueName: collapseWhitespace(fields.colleagueName),
    position: collapseWhitespace(fields.position),
    section: collapseWhitespace(fields.section),
    department: collapseWhitespace(fields.department),
  };
}
