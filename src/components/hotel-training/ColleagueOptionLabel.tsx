import type { Colleague } from '@/types/hotel-training';

// The body of one colleague option, shared by the participant and trainer pickers.
//
// Six lines, and extracted anyway: "same look" is a stated requirement, and two copies
// of this markup are exactly how "same look" quietly stops being true. Duplicating it
// costs nothing today and costs a mismatched dropdown the first time either is restyled.
export function ColleagueOptionLabel({ colleague }: { colleague: Colleague }) {
  return (
    <>
      <span className="font-medium">{colleague.colleagueName}</span>
      <span className="ml-2 text-xs text-muted-foreground">ID: {colleague.employeeId}</span>
    </>
  );
}
