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

// A person from the company directory who can be recorded as a trainer.
// The lowercased email is the stable identity key end-to-end.
export interface TrainerRef {
  displayName: string;
  email: string;
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
  trainers: TrainerRef[];
}

export type WizardStep = 1 | 2 | 3;
export type SuccessState = 'full' | 'partial' | null;

export interface HotelTrainingDraft {
  trainingDetails: Partial<TrainingDetailsValues> | null;
  participants: ParticipantRow[];
  step: WizardStep;
  savedAt: string;
}
