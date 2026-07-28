import type { TrainerRef } from '@/types/hotel-training';

export const MONTHLY_TRAINING_LIST_ID = 'aa8fe143-854d-4646-a423-89bc44bb217d';
export const PARTICIPANTS_LIST_ID = '73f67c6d-f327-4c14-aa68-2b718afcd132';
export const COLLEAGUES_LIST_ID = '8bdc10b9-01c8-4310-8a16-48eb83020d7e';
export const SP_SITE_HOST = '2seasonshotels.sharepoint.com';
export const SP_SITE_PATH = '/sites/Two_Seasons_Training_Record';

export const DURATION_OPTIONS: { label: string; minutes: number }[] = [
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '1 hour', minutes: 60 },
  { label: '1.5 hours', minutes: 90 },
  { label: '2 hours', minutes: 120 },
  { label: '2.5 hours', minutes: 150 },
  { label: '3 hours', minutes: 180 },
  { label: '3.5 hours', minutes: 210 },
  { label: '4 hours', minutes: 240 },
  { label: '4.5 hours', minutes: 270 },
  { label: '5 hours', minutes: 300 },
  { label: '5.5 hours', minutes: 330 },
  { label: '6 hours', minutes: 360 },
  { label: '6.5 hours', minutes: 390 },
  { label: '7 hours', minutes: 420 },
  { label: '7.5 hours', minutes: 450 },
  { label: '8 hours', minutes: 480 },
];

export const ADMIN_EMAILS = [
  'ahmed.mokhtar@2seasonshotels.com',
  'amir.monir@2seasonshotels.com',
  'xarmaigne.narciso@2seasonshotels.com',
];

export const DEPARTMENT_SECTIONS: Record<string, string[]> = {
  'Engineering': ['Engineering'],
  'Executive Office': ['Executive Office'],
  'Finance': ['Finance'],
  'Food & Beverage': ['La Terrasse', 'House Of Noodles', 'Pool Bar', 'Room Service / Minibar', 'Banquet', 'F & B Admin', 'Stewarding', 'Le Grand Café'],
  'Front Office': ['Concierge', 'Front Office Admin', 'Guest Relations', 'Reception Long Term', 'Telecommunication', 'Reception Hotel'],
  'Housekeeping': ['Housekeeping', 'Laundry'],
  'Human Resources': ['Human Resources', 'Colleague Cafeteria'],
  'Information Technology': ['Information Technology'],
  'Kitchen': ['Kitchen Admin', 'Kitchen Hot', 'House Of Noodles - Kitchen', 'Kitchen Pastry', 'Kitchen Cold', 'Kitchen Butchery', 'Kitchen Sushi', 'Kitchen Bakery'],
  'Materials': ['Materials'],
  'Recreation': ['Recreation'],
  'Revenue': ['Revenue', 'Reservation'],
  'Sales & Marketing': ['Sales & Marketing'],
  'Security': ['Security'],
};

// Known trainers used when the live directory fetch fails (or returns empty)
// and to migrate legacy drafts that stored trainer names as plain strings.
export const FALLBACK_TRAINERS: TrainerRef[] = [
  { displayName: 'Ahmed Mokhtar', email: 'ahmed.mokhtar@2seasonshotels.com' },
  { displayName: 'Amir Monir', email: 'amir.monir@2seasonshotels.com' },
  { displayName: 'Xarmaigne Narciso', email: 'xarmaigne.narciso@2seasonshotels.com' },
];

// Offline fallbacks for the Location/Remarks column types, used only when the
// sp-read-columns call fails (the live types are read from Graph column
// facets). 'Text' is the safe default: a text input can carry any value the
// user types (the mirror stores it as text), whereas a wrong 'Number' guess
// blocks legitimate input.
export const LOCATION_TYPE_AS_STRING = 'Text';
export const REMARKS_TYPE_AS_STRING = 'Text';

export const DRAFT_KEY = (email: string) =>
  `hotel-training-draft-${email.toLowerCase()}`;
