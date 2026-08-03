import type { TrainerRef } from '@/types/hotel-training';

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
