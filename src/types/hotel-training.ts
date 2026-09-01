export interface Colleague {
  id: string;
  employeeId: string;
  colleagueName: string;
  position: string;
  section: string;
  department: string;
  isActive: boolean;
}

export interface ParticipantRow {
  rowNo: number;
  colleague: Colleague | null;
}

export interface TrainingDetailsValues {
  title: string;
  department: string;
  durationMinutes: number;
  totalParticipants: number;
  location?: number | string;
  remarks?: number | string;
  date: Date;
  hour: number;
  minute: number;
  // The SAME type a participant row holds, and that is the requirement rather than a
  // convenience: the trainer field is the participant picker. Plain text is the wire
  // and Postgres shape only (src/lib/trainer-names.ts); in memory and in drafts a
  // trainer is a colleague, so exclusion can key on `employeeId` instead of on a name.
  //
  // TrainerRef — displayName + email + inSite + jobTitle — was deleted here. It
  // modelled a person who might not be resolvable in SharePoint, which was only ever a
  // property of the Person column this no longer writes.
  trainers: Colleague[];
}

export type WizardStep = 1 | 2 | 3;
export type SuccessState =
  | 'full'
  | 'partial'
  | {
      // Some participant rows never reached SharePoint. Terminal: the Confirm button must not
      // come back, because a resubmission mints a new trainingId and duplicates the session.
      kind: 'partial-participants';
      trainingId: string;
      failed: Array<{ name: string; employeeId: string; error: string }>;
    }
  | null;

export interface HotelTrainingDraft {
  trainingDetails: Partial<TrainingDetailsValues> | null;
  participants: ParticipantRow[];
  step: WizardStep;
  savedAt: string;
}
