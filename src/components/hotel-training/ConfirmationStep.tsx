import React from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DURATION_OPTIONS } from '@/lib/hotel-training-constants';
import type { ParticipantRow, TrainingDetailsValues } from '@/types/hotel-training';

interface Props {
  trainingDetails: TrainingDetailsValues;
  participants: ParticipantRow[];
  isPending: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export function ConfirmationStep({
  trainingDetails,
  participants,
  isPending,
  onBack,
  onConfirm,
}: Props) {
  const durationLabel =
    DURATION_OPTIONS.find((duration) => duration.minutes === trainingDetails.durationMinutes)?.label ??
    `${trainingDetails.durationMinutes} min`;

  const date = new Date(trainingDetails.date);
  date.setHours(trainingDetails.hour, trainingDetails.minute, 0, 0);
  const dateLabel = format(date, 'PPPp');

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Training Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <span className="text-muted-foreground">Title</span>
          <span className="font-medium">{trainingDetails.title}</span>
          <span className="text-muted-foreground">Department</span>
          <span>{trainingDetails.department}</span>
          <span className="text-muted-foreground">Duration</span>
          <span>{durationLabel}</span>
          <span className="text-muted-foreground">Date &amp; Time</span>
          <span>{dateLabel}</span>
          <span className="text-muted-foreground">Trainers</span>
          <span className="flex flex-wrap gap-1">
            {trainingDetails.trainers.map((trainer) => (
              <Badge key={trainer.employeeId} variant="secondary">
                {trainer.colleagueName}
              </Badge>
            ))}
          </span>
          <span className="text-muted-foreground">Total Participants</span>
          <span>{trainingDetails.totalParticipants}</span>
          {trainingDetails.location != null && (
            <>
              <span className="text-muted-foreground">Location</span>
              <span>{trainingDetails.location}</span>
            </>
          )}
          {trainingDetails.remarks != null && (
            <>
              <span className="text-muted-foreground">Remarks</span>
              <span>{trainingDetails.remarks}</span>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Participants ({participants.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Department</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((participant) => (
                <TableRow key={participant.rowNo}>
                  <TableCell>{participant.rowNo}</TableCell>
                  <TableCell className="font-medium">{participant.colleague?.colleagueName}</TableCell>
                  <TableCell>{participant.colleague?.employeeId}</TableCell>
                  <TableCell>{participant.colleague?.position}</TableCell>
                  <TableCell>{participant.colleague?.section}</TableCell>
                  <TableCell>{participant.colleague?.department}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={isPending}>
          Back to edit
        </Button>
        <Button type="button" onClick={onConfirm} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            'Confirm & Submit'
          )}
        </Button>
      </div>
    </div>
  );
}
