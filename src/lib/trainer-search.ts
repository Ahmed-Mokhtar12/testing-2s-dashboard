import type { TrainerRef } from '@/types/hotel-training';

// Minimum characters before the wider-directory search is offered.
//
// DECLARED TWICE, in two runtimes, and it must not drift:
//
//   src/lib/trainer-search.ts                      MIN_SEARCH_LENGTH  (offers the search)
//   supabase/functions/_shared/directory.ts        MIN_SEARCH_LENGTH  (refuses the search)
//
// They cannot share a module: the edge tree is Deno, both tsconfigs exclude it, and
// importing across the boundary would break the git archive the deploy scripts build.
// So the drift is made detectable instead of pretended away —
// tests/unit/search-length-agrees.test.ts fails the build if they disagree.
//
// What that prevents, concretely: a UI that offers "Search the full Microsoft
// directory" at 2 characters while the function rejects anything under 3. The user
// clicks and gets an error for typing what the form invited them to type.
export const MIN_SEARCH_LENGTH = 2;

// The local filter over the already-loaded trainer list.
//
// Hand-rolled rather than left to cmdk's built-in filter because the picker now shows
// two groups and only one of them is local. cmdk cannot filter the wider results —
// they are fetched on demand, not rendered up-front — so letting it filter the staff
// group while the directory group stayed visible would look like a bug. One filter,
// applied here, governs both.
//
// Matches on display name and email, case-insensitively, on substring. Deliberately
// MORE permissive than the Graph search it sits beside: Graph tokenises, so "hammad"
// will not find "Mohammad" there, but there is no reason to inflict that on a list
// already in memory.
export function filterTrainersByQuery(trainers: TrainerRef[], query: string): TrainerRef[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return trainers;
  return trainers.filter(
    (trainer) =>
      trainer.displayName.toLowerCase().includes(needle) ||
      trainer.email.toLowerCase().includes(needle),
  );
}
