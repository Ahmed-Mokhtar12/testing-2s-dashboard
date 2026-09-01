import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Check, Circle, CircleDot } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { ConfirmationStep } from '@/components/hotel-training/ConfirmationStep';
import { ParticipantsStep } from '@/components/hotel-training/ParticipantsStep';
import { TrainingDetailsForm } from '@/components/hotel-training/TrainingDetailsForm';
import { AdminPanel } from '@/components/hotel-training/AdminPanel';
import { useAuth } from '@/hooks/useAuth';
import { useColleagues } from '@/hooks/useColleagues';
import { useListColumns } from '@/hooks/useListColumns';
import { useTrainingSubmit } from '@/hooks/useTrainingSubmit';
import { reconcileDraft } from '@/lib/hotel-training-draft';
import { ADMIN_EMAILS, DRAFT_KEY } from '@/lib/hotel-training-constants';
import type {
  Colleague,
  HotelTrainingDraft,
  ParticipantRow,
  SuccessState,
  TrainingDetailsValues,
  WizardStep,
} from '@/types/hotel-training';

const DEBOUNCE_MS = 800;

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Training Details',
  2: 'Participants',
  3: 'Confirm & Submit',
};

function makeEmptyRows(count: number): ParticipantRow[] {
  return Array.from({ length: count }, (_, index) => ({ rowNo: index + 1, colleague: null }));
}

export default function HotelTraining() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase() ?? '');

  const {
    data: colleagues = [],
    isLoading: colleaguesLoading,
    isError: colleaguesFailed,
    error: colleaguesError,
  } = useColleagues();
  // No isLoading destructured: useListColumns supplies placeholderData, so there is no
  // state in which the page needs to know it is in flight. useColleagues cannot — a
  // placeholder colleague list is a list of people who do not exist — and now that the
  // trainer field reads it, step 1 genuinely waits on it. See "Known regression,
  // accepted" in the spec.
  const { data: columns } = useListColumns();
  const { mutate: submitTraining, isPending } = useTrainingSubmit();

  // One status rather than two booleans, because the trainer picker has to SAY which of
  // the three it is: an empty option list used to be impossible there.
  const colleaguesStatus = colleaguesFailed ? 'error' : colleaguesLoading ? 'loading' : 'ready';

  const [step, setStep] = useState<WizardStep>(1);
  const [trainingDetails, setTrainingDetails] = useState<TrainingDetailsValues | null>(null);
  const [draftTrainingDetails, setDraftTrainingDetails] = useState<Partial<TrainingDetailsValues> | null>(null);
  const [restoredDraftDetails, setRestoredDraftDetails] = useState<Partial<TrainingDetailsValues> | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [draftNotices, setDraftNotices] = useState<string[]>([]);
  const [successState, setSuccessState] = useState<SuccessState>(null);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [detailsFormVersion, setDetailsFormVersion] = useState(0);
  const [reduceConfirm, setReduceConfirm] = useState<{
    newCount: number;
    pendingDetails: TrainingDetailsValues;
  } | null>(null);

  const draftKeyStr = DRAFT_KEY(user?.email ?? 'unknown');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKeyStr);
      if (raw) {
        const draft = JSON.parse(raw) as HotelTrainingDraft;
        setDraftDate(draft.savedAt);
      }
    } catch {
      // Ignore invalid drafts.
    }
  }, [draftKeyStr]);

  useEffect(() => {
    if (colleaguesFailed) {
      toast.error(colleaguesError?.message ?? 'Could not load colleagues from SharePoint.');
    }
  }, [colleaguesFailed, colleaguesError]);

  useEffect(() => {
    if (successState || draftDate) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      try {
        const draft: HotelTrainingDraft = {
          trainingDetails: draftTrainingDetails ?? trainingDetails,
          participants,
          step,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(draftKeyStr, JSON.stringify(draft));
      } catch {
        // Ignore storage failures.
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [trainingDetails, draftTrainingDetails, participants, step, draftKeyStr, successState, draftDate]);

  const restoreDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(draftKeyStr);
      if (!raw) return;

      // reconcileDraft validates the trainers and the participant rows against each
      // other and reports what it changed; date revival stays here, so that function
      // can be pure and take no clock.
      const reconciled = reconcileDraft(JSON.parse(raw));
      const restoredDetails = reconciled.details
        ? {
            ...reconciled.details,
            date: reconciled.details.date ? new Date(reconciled.details.date) : undefined,
          }
        : null;

      setRestoredDraftDetails(restoredDetails);
      setDraftTrainingDetails(restoredDetails);
      setParticipants(reconciled.participants);
      setDraftNotices(reconciled.notices);
      setStep(1);
      setDraftDate(null);
    } catch {
      toast.error('Could not restore the saved draft.');
    }
  }, [draftKeyStr]);

  const discardDraft = useCallback(() => {
    localStorage.removeItem(draftKeyStr);
    setDraftDate(null);
  }, [draftKeyStr]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(draftKeyStr);
    setDraftDate(null);
  }, [draftKeyStr]);

  // MUTUAL EXCLUSION, derived on both sides rather than stored.
  //
  // The trainer side reads `participants`. The participant side reads
  // trainingDetails.trainers — the COMMITTED value, deliberately never
  // draftTrainingDetails: that mirror is per-keystroke and explicitly reversible (the
  // reduce-confirm Cancel path throws it away), so a half-typed trainer edit that the
  // user then abandons must not have emptied a filled participant row on the way.
  //
  // Keyed on employeeId throughout. Names are not unique in Colleagues_Master — a
  // re-hired colleague holds two rows — and matching people by name is the unreliable
  // join this whole change exists to refute.
  const committedTrainers = trainingDetails?.trainers ?? [];
  const participantEmployeeIds = useMemo(
    () => new Set(
      participants
        .filter((row) => row.colleague)
        .map((row) => row.colleague!.employeeId),
    ),
    [participants],
  );

  const handleParticipantChange = (index: number, colleague: Colleague | null) => {
    setParticipants((previous) => {
      const next = [...previous];
      next[index] = { ...next[index], colleague };
      return next;
    });
  };

  const applyStep1 = (values: TrainingDetailsValues, newCount: number, previousCount: number) => {
    setTrainingDetails(values);
    setDraftTrainingDetails(values);
    setRestoredDraftDetails(null);
    // Leaving step 1 with the details accepted is what makes the reconciliation notices
    // stale: whatever they asked for has either been done or deliberately not.
    setDraftNotices([]);

    if (newCount > previousCount) {
      setParticipants((previous) => [
        ...previous,
        ...makeEmptyRows(newCount - previous.length).map((row, index) => ({
          ...row,
          rowNo: previous.length + index + 1,
        })),
      ]);
    } else if (newCount < previousCount) {
      setParticipants((previous) => previous.slice(0, newCount));
    } else if (participants.length === 0) {
      setParticipants(makeEmptyRows(newCount));
    }

    setStep(2);
  };

  const handleStep1Next = (values: TrainingDetailsValues) => {
    const newCount = values.totalParticipants;
    const previousCount = trainingDetails?.totalParticipants ?? participants.length;

    if (participants.length > 0 && newCount < previousCount) {
      const rowsToTrim = participants.slice(newCount);
      const hasFilledRows = rowsToTrim.some((row) => row.colleague !== null);

      if (hasFilledRows) {
        setReduceConfirm({ newCount, pendingDetails: values });
        return;
      }
    }

    applyStep1(values, newCount, previousCount);
  };

  const handleReduceConfirm = () => {
    if (!reduceConfirm) return;

    applyStep1(
      reduceConfirm.pendingDetails,
      reduceConfirm.newCount,
      trainingDetails?.totalParticipants ?? participants.length,
    );
    setReduceConfirm(null);
  };

  const handleConfirmSubmit = () => {
    if (!trainingDetails) return;

    submitTraining(
      { trainingDetails, participants },
      {
        onSuccess: (result) => {
          if (result.failedParticipants.length > 0) {
            // Deliberately NOT "Please retry". Submitting again mints a fresh
            // trainingId and creates a SECOND SharePoint session: the session
            // list item carries no TrainingID field, so sp-submit-training
            // cannot recognise a resubmission and dedupe it. The old copy's
            // advice was the fastest route to duplicated data.
            toast.error(
              `Training saved as ${result.trainingId}: ${result.failedParticipants.length} of `
                + `${trainingDetails.totalParticipants} participant rows did not reach SharePoint. `
                + 'Do NOT submit again — that would create a duplicate session. The missing rows '
                + 'are recorded for an admin to add.',
              { duration: 15000 },
            );
            // A toast is not a guard: the Confirm button used to re-enable behind it and the
            // autosaved draft survived a reload straight back to Confirm (audit A8). Enter a
            // terminal state and clear the draft.
            clearDraft();
            setSuccessState({
              kind: 'partial-participants',
              trainingId: result.trainingId,
              failed: result.failedParticipants.map((f) => ({
                name: f.row.colleagueName,
                employeeId: f.row.employeeId,
                error: f.error,
              })),
            });
            return;
          }

          clearDraft();
          setSuccessState(result.syncStatus === 'partial' ? 'partial' : 'full');
        },
        onError: (error) => {
          toast.error(error.message || 'Submission failed. Your draft is saved.');
        },
      },
    );
  };

  if (successState) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-10 text-center">
        {typeof successState === 'object' && successState.kind === 'partial-participants' ? (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 text-2xl text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
              !
            </div>
            <h2 className="text-xl font-semibold">
              Training {successState.trainingId} saved with {successState.failed.length} participant
              {successState.failed.length === 1 ? ' row' : ' rows'} missing
            </h2>
            <p className="text-sm text-muted-foreground">
              These rows did not reach SharePoint. Do NOT submit again — that would create a duplicate
              session. An admin will add them.
            </p>
            <ul data-testid="partial-failed-rows" className="w-full max-w-md text-left text-sm">
              {successState.failed.map((row) => (
                <li key={`${row.employeeId}-${row.name}`} className="flex justify-between gap-3 border-b border-border py-1.5">
                  <span>{row.name} <span className="text-muted-foreground">({row.employeeId})</span></span>
                  <span className="text-muted-foreground truncate">{row.error}</span>
                </li>
              ))}
            </ul>
          </>
        ) : successState === 'full' ? (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-semibold">Training submitted successfully.</h2>
          </>
        ) : (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 text-2xl text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
              !
            </div>
            <h2 className="text-xl font-semibold">Training saved to SharePoint. Dashboard sync pending.</h2>
            <p className="text-sm text-muted-foreground">
              Your training record is safely saved. The analytics dashboard will sync shortly.
            </p>
          </>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          <Button
            type="button"
            onClick={() => {
              setSuccessState(null);
              setStep(1);
              setTrainingDetails(null);
              setDraftTrainingDetails(null);
              setRestoredDraftDetails(null);
              setDetailsFormVersion((version) => version + 1);
              setParticipants([]);
              setDraftNotices([]);
            }}
          >
            Register New Training
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // No page-wide loading gate. It used to be
  //   colleaguesLoading || columnsLoading || trainersLoading
  // which blanked the whole wizard until the SLOWEST of three cold edge functions
  // answered — measured at 3.5-3.8 s typically and 16 s once, with the page
  // showing nothing but "Loading training data..." throughout
  // (docs/perf/hotel-training-baseline.md).
  //
  // Nothing on step 1 actually needs a network answer: departments come from
  // constants, the column types default to 'Text', and the trainer list has a
  // built-in fallback — all three hooks now supply placeholderData, so step 1
  // renders on the first paint. Only the participant picker genuinely needs live
  // data, so only step 2 waits, and by then the user has spent several seconds
  // filling in step 1.

  const registerTrainingContent = (
    // pb-24 on small screens: the Sera chat button is `fixed bottom-6 right-6` and
    // 3.5rem tall (RightChatPanel.tsx), so it occupies the bottom 5rem of the viewport
    // at every scroll position. Below lg the document itself scrolls, so the LAST
    // control of whichever step is on screen — "Next: Review", "Confirm & Submit" —
    // ends up underneath it once the content is tall enough to scroll at all, and is
    // simply not clickable.
    //
    // FOUND BY A TEST FAILING FOR THE RIGHT REASON, and it predates this change: three
    // participant rows used to fit, four would not have. Naming the trainers in the
    // step 2 intro added two lines and moved the threshold to three, which is what
    // surfaced it. lg keeps pb-0 — there the wizard is its own scroll container inside
    // a locked shell, and the 100-row layout test pins that behaviour.
    <div className="mx-auto w-full max-w-2xl space-y-6 pb-24 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-0 lg:pr-1">
      {draftDate && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>You have an unsaved draft from {format(new Date(draftDate), 'PPp')}.</span>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={restoreDraft}>
                Restore
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={discardDraft}>
                Discard
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* A persistent, dismissible Alert rather than a toast. A toast that says "your
          saved trainer was dropped, pick again" is gone in four seconds, and the person
          it is addressed to is by definition restoring work they left — they may not be
          looking. Dismissal is theirs; applyStep1 also clears these once step 1 is
          accepted. */}
      {draftNotices.length > 0 && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-start justify-between gap-2">
            <span className="flex-1 space-y-1">
              {draftNotices.map((notice) => (
                <span key={notice} className="block">{notice}</span>
              ))}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => setDraftNotices([])}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {reduceConfirm && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Reducing participant count will remove filled entries. Continue?</span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="destructive" onClick={handleReduceConfirm}>
                Yes, reduce
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setReduceConfirm(null);
                  setDraftTrainingDetails(trainingDetails);
                  setDetailsFormVersion((version) => version + 1);
                }}
              >
                Cancel
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2 text-sm">
        {([1, 2, 3] as WizardStep[]).map((wizardStep, index) => (
          <React.Fragment key={wizardStep}>
            <button
              type="button"
              className={
                wizardStep === step
                  ? 'flex items-center gap-1.5 font-semibold text-primary'
                  : wizardStep < step
                    ? 'flex items-center gap-1.5 text-muted-foreground hover:text-foreground'
                    : 'flex cursor-default items-center gap-1.5 text-muted-foreground/50'
              }
              onClick={() => {
                if (wizardStep < step) setStep(wizardStep);
              }}
              disabled={wizardStep > step}
            >
              {wizardStep < step ? (
                <Check className="h-4 w-4 text-primary" />
              ) : wizardStep === step ? (
                <CircleDot className="h-4 w-4 text-primary" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
              {STEP_LABELS[wizardStep]}
            </button>
            {index < 2 && <span className="h-px flex-1 bg-border" />}
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <TrainingDetailsForm
          key={detailsFormVersion}
          defaultValues={trainingDetails ?? restoredDraftDetails}
          departments={columns?.departments ?? []}
          allColleagues={colleagues}
          colleaguesStatus={colleaguesStatus}
          unavailableEmployeeIds={participantEmployeeIds}
          locationTypeAsString={columns?.locationTypeAsString ?? 'Text'}
          remarksTypeAsString={columns?.remarksTypeAsString ?? 'Text'}
          onDraftChange={setDraftTrainingDetails}
          onNext={handleStep1Next}
        />
      )}
      {step === 2 && (
        <>
          {colleaguesFailed && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                {colleaguesError?.message ?? 'Could not load colleagues from SharePoint.'}
              </AlertDescription>
            </Alert>
          )}
          {colleaguesLoading && participants.every((row) => row.colleague === null) ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading colleagues...
            </div>
          ) : (
            <ParticipantsStep
              participants={participants}
              allColleagues={colleagues}
              trainers={committedTrainers}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
              onChange={handleParticipantChange}
            />
          )}
        </>
      )}
      {step === 3 && trainingDetails && (
        <ConfirmationStep
          trainingDetails={trainingDetails}
          participants={participants}
          isPending={isPending}
          onBack={() => setStep(2)}
          onConfirm={handleConfirmSubmit}
        />
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 short:gap-4">
      <SectionHeader title="Hotel Training" subtitle="Register monthly training sessions and manage participants." />

      {isAdmin ? (
        <Tabs defaultValue="register" className="lg:min-h-0 lg:flex-1 lg:flex lg:flex-col">
          <TabsList>
            <TabsTrigger value="register">Register Training</TabsTrigger>
            <TabsTrigger value="admin">Manage Members</TabsTrigger>
          </TabsList>
          <TabsContent value="register" className="pt-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {registerTrainingContent}
          </TabsContent>
          <TabsContent value="admin" className="pt-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <AdminPanel />
          </TabsContent>
        </Tabs>
      ) : (
        registerTrainingContent
      )}
    </div>
  );
}
