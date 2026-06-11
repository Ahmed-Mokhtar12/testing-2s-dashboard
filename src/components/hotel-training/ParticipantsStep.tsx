import React, { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ParticipantRow } from './ParticipantRow';
import type { Colleague, ParticipantRow as ParticipantRowType } from '@/types/hotel-training';

interface Props {
  participants: ParticipantRowType[];
  allColleagues: Colleague[];
  onBack: () => void;
  onNext: (participants: ParticipantRowType[]) => void;
  onChange: (index: number, colleague: Colleague | null) => void;
}

export function ParticipantsStep({ participants, allColleagues, onBack, onNext, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => new Set(participants.filter((participant) => participant.colleague).map((participant) => participant.colleague!.employeeId)),
    [participants],
  );

  const handleNext = () => {
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
            selectedEmployeeIds={selectedIds}
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
