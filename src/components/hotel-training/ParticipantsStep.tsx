import React, { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ParticipantRow } from './ParticipantRow';
import type { Colleague, ParticipantRow as ParticipantRowType } from '@/types/hotel-training';

interface Props {
  participants: ParticipantRowType[];
  allColleagues: Colleague[];
  /**
   * The session's trainers, from the COMMITTED training details — never the
   * per-keystroke draft. Passed as colleagues rather than as ids because this step
   * both excludes them and names them.
   */
  trainers: Colleague[];
  onBack: () => void;
  onNext: (participants: ParticipantRowType[]) => void;
  onChange: (index: number, colleague: Colleague | null) => void;
}

export function ParticipantsStep({
  participants,
  allColleagues,
  trainers,
  onBack,
  onNext,
  onChange,
}: Props) {
  const [error, setError] = useState<string | null>(null);

  const trainerIds = useMemo(
    () => new Set(trainers.map((trainer) => trainer.employeeId)),
    [trainers],
  );

  const selectedIds = useMemo(
    () => new Set(participants.filter((participant) => participant.colleague).map((participant) => participant.colleague!.employeeId)),
    [participants],
  );

  // One set per row, so a row cannot honour half the rule. Union rather than two props
  // for the same reason: filterColleagues takes one `exclude`, and a second set that
  // some caller forgets to pass is the shape of the defect.
  const unavailableIds = useMemo(
    () => new Set([...trainerIds, ...selectedIds]),
    [trainerIds, selectedIds],
  );

  const trainerNames = trainers.map((trainer) => trainer.colleagueName).join(', ');

  const handleNext = () => {
    // A BACKSTOP, checked first so it wins over the vaguer messages below.
    //
    // Unreachable from the UI by construction: this dropdown excludes the trainers,
    // the trainer picker excludes the participants, and reconcileDraft clears an
    // overlapping row on restore. That is why no e2e test drives it — there is no
    // sequence of clicks that produces the state. It exists because the alternative to
    // a visible refusal is blanking a filled row at submit time, which is the same
    // class of silent data loss the reduce-count confirmation exists to prevent.
    const conflicts = participants.filter(
      (participant) => participant.colleague && trainerIds.has(participant.colleague.employeeId),
    );
    if (conflicts.length > 0) {
      const named = conflicts
        .map((participant) => `row ${participant.rowNo} (${participant.colleague!.colleagueName})`)
        .join(', ');
      setError(
        `${named} ${conflicts.length === 1 ? 'is' : 'are'} also listed as a trainer. `
        + 'A colleague cannot be both on one session — change the row, or go back and drop them as a trainer.',
      );
      return;
    }

    const incomplete = participants.some((participant) => participant.colleague === null);
    if (incomplete) {
      setError('Please select all participants before continuing.');
      return;
    }

    const ids = participants.map((participant) => participant.colleague!.employeeId);
    const hasDuplicate = ids.length !== new Set(ids).size;
    if (hasDuplicate) {
      setError('Duplicate participants are not allowed.');
      return;
    }

    setError(null);
    onNext(participants);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select a colleague for each row. Only active colleagues are shown.
        {trainers.length > 0 && (
          <>
            {' '}
            {trainers.length === 1 ? 'The trainer' : 'The trainers'} ({trainerNames}){' '}
            {trainers.length === 1 ? 'is' : 'are'} not offered here — a colleague cannot be
            both trainer and participant.
          </>
        )}
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        {participants.map((row, index) => (
          <ParticipantRow
            key={row.rowNo}
            row={row}
            allColleagues={allColleagues}
            unavailableEmployeeIds={unavailableIds}
            onChange={(colleague) => onChange(index, colleague)}
          />
        ))}
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={handleNext}>
          Next: Review
        </Button>
      </div>
    </div>
  );
}
