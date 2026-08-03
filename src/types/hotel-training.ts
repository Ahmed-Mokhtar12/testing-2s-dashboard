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
  // Whether this person exists in the SharePoint site's User Information List, and
  // so whether a training can be filed against them TODAY. false does not mean "not
  // a real person" — it means SharePoint has no id to record them under yet.
  //
  // OPTIONAL on purpose. Trainers saved in a localStorage draft before this field
  // existed, and the FALLBACK_TRAINERS constant, both omit it; treating undefined as
  // "no information" rather than "not in the site" keeps those working without a
  // migration. Only values that came from a wider directory search are ever false.
  inSite?: boolean;
  // Directory job title, shown beside a wider-search result to tell two people with
  // the same name apart. Never present on entries sourced from the site list.
  jobTitle?: string;
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
