// The frontend half of the TrainerNames format contract.
//
// THIS IS A SECOND IMPLEMENTATION, ON PURPOSE, of the rule in
// supabase/functions/_shared/trainer-names.ts. The two cannot share a module: the
// edge tree is Deno, both tsconfigs exclude it, and an import across the boundary
// would break the git archive the deploy scripts build — the same constraint that
// makes MAX_PARTICIPANTS a declared-twice number.
//
// WHY THE CLIENT MUST APPLY IT AT ALL, rather than leaving cleaning to the edge
// function. `training_sessions.trainer_names` is written by the CLIENT
// (useTrainingSubmit) while `TrainerNames` in SharePoint is written by the edge
// function from the same request. If only one side collapsed whitespace, one live
// colleague — "Muhammed Muhammed  Zawahir", a real row with a double space — would
// be stored under two different strings in two stores. Worse, the migration in
// 20260803190000 normalised the existing Postgres rows to the COLLAPSED spelling,
// so an uncollapsed client would start writing names that no longer match the
// history, and every report spanning the cutover would count that person twice.
// That is the exact defect commit 2 existed to prevent.
//
// tests/unit/trainer-names-agree.test.ts runs both implementations over one table
// of inputs and fails the build when they disagree.

// Runs of whitespace collapse to a single space, then trim.
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// The names to send and to store, from the chosen trainers. One array, computed
// once, used for both destinations.
//
// Case-insensitive dedupe keeping the FIRST spelling, matching the edge function.
// The picker excludes by employeeId, so two rows for one re-hired colleague could
// both be chosen and would otherwise render "X; X" — a list that reads as two
// trainers.
//
// DIVERGENCE FROM THE EDGE FUNCTION, deliberate and asserted in the agreement
// test: a name that collapses to nothing is SKIPPED here and REJECTS THE WHOLE
// FIELD there. The edge function is a gate against a hand-built body and must
// fail closed; this runs over objects that already satisfy the form's zod schema
// (`colleagueName` min length 1), so the case is unreachable from the UI and
// failing the submit over it would only ever hurt a legitimate user.
export function toTrainerNames(trainers: ReadonlyArray<{ colleagueName: string }>): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const trainer of trainers) {
    const name = collapseWhitespace(trainer.colleagueName);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    names.push(name);
  }

  return names;
}
