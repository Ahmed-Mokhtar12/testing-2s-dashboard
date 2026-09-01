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

// UI visibility only (which tabs render). The server checks user_roles via has_role in
// sp-manage-colleague; this list is NOT an authorization boundary and no longer has a
// server-side twin to keep in sync.
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

// FALLBACK_TRAINERS was three hardcoded names, used when the directory read failed
// and to migrate drafts that stored trainer names as plain strings. Both jobs are
// gone: any of the ~335 active colleagues can be a trainer, so a three-name fallback
// is not a degraded list, it is a wrong one — it would offer three people while
// hiding everyone who can actually be recorded, and the two colleagues among them
// are named differently in Colleagues_Master ("Amir Monir" is "Amir Gerges Daoud"),
// so a submission built from it would write names the report cannot join.
//
// The consequence is recorded and accepted: step 1 can no longer be completed with
// no network. See "Known regression, accepted" in the spec, and the cold-start test
// in tests/hotel-training.spec.ts, which now asserts the trainer popover says
// "Loading colleagues..." rather than offering people who might not exist.

// Offline fallbacks for the Location/Remarks column types, used only when the
// sp-read-columns call fails (the live types are read from Graph column
// facets). 'Text' is the safe default: a text input can carry any value the
// user types (the mirror stores it as text), whereas a wrong 'Number' guess
// blocks legitimate input.
export const LOCATION_TYPE_AS_STRING = 'Text';
export const REMARKS_TYPE_AS_STRING = 'Text';

export const DRAFT_KEY = (email: string) =>
  `hotel-training-draft-${email.toLowerCase()}`;

// Maximum participants in one training session. Raised 15 -> 100 on 2026-08-01.
//
// THIS NUMBER IS DECLARED TWICE, and it has to be. The edge function
// supabase/functions/sp-submit-training/index.ts enforces the same cap, and the
// two runtimes cannot share a module: the edge tree is Deno, both tsconfigs
// exclude it, and an import across the boundary would break the git archive the
// deploy scripts build. A form that accepts 100 while the function rejects
// anything over 15 is worse than no change at all, so the drift is made
// detectable instead of pretended away —
// tests/unit/participant-cap-agrees.test.ts fails the build if the two numbers
// disagree.
//
// Derive every user-facing message from this constant rather than writing the
// number into a string; a message saying "Maximum 15" while the validator allows
// 100 is the same drift wearing different clothes.
//
// NOTE the wizard blocks duplicate participants, so filling N rows needs N
// distinct ACTIVE colleagues in the directory. If the active roster is smaller
// than this cap, the roster is the real ceiling.
export const MAX_PARTICIPANTS = 100;
