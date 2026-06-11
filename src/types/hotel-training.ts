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
  location?: number;
  remarks?: number;
  date: Date;
  hour: number;
  minute: number;
  trainerNames: string[];
}

export type WizardStep = 1 | 2 | 3;
export type SuccessState = 'full' | 'partial' | null;

export interface HotelTrainingDraft {
  trainingDetails: TrainingDetailsValues | null;
  participants: ParticipantRow[];
  step: WizardStep;
  savedAt: string;
}
