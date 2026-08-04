// Whitespace normalisation for text that gets STORED, on the edge side.
//
// Lives here rather than in trainer-names.ts because it is not about trainers. It was
// written there first, for the TrainerNames format contract, and then a second caller
// appeared — sp-manage-colleague, which writes the colleague rows that contract reads
// from. trainer-names.ts now re-exports collapseWhitespace so its own importers are
// unchanged.
//
// WHY IT EXISTS AT ALL. Colleagues_Master is hand-maintained, and on 2026-08-04 six of
// its 336 rows carried repeated or leading whitespace: five names and two positions. The
// consequences were not cosmetic — the monthly report dedupes trainer names with
// raw.trim().toLowerCase(), which treats "A  B" and "A B" as two different people, and
// Sera searches participants with `.includes(needle)`, which fails to match a stored
// double space against a needle typed with one space. Five colleagues were unfindable.
//
// Zero imports and no Deno APIs, so `node --test` can run its tests without a Deno
// runtime — the same reason uil-mapper.ts and trainer-names.ts are shaped this way.

// Runs of whitespace collapse to a single space, then trim.
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// The four text fields of a Colleagues_Master row, normalised for storage.
//
// ALL FOUR, not just the name. Two of the six dirty rows found on 2026-08-04 were
// POSITIONS — " IT Manager" with a leading space, and "Executive Secretary  /PA" — and
// position, section and department travel into training_participants exactly as the name
// does. Collapsing only the field whose symptom had been noticed would have left the same
// defect in three others and made the next one harder to recognise, not easier.
//
// Declared as one function rather than four call-site collapses so "which fields are
// normalised" is a single fact with a single test, in both runtimes.
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
