import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useTrainers } from '@/hooks/useTrainers';
import { useTrainingSubmit } from '@/hooks/useTrainingSubmit';
import { ADMIN_EMAILS, DRAFT_KEY, FALLBACK_TRAINERS } from '@/lib/hotel-training-constants';
import type {
  Colleague,
  HotelTrainingDraft,
  ParticipantRow,
  SuccessState,
  TrainerRef,
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

// Drafts saved before the TrainerRef migration stored plain name strings
// under the retired trainer field. Detect that field structurally (a
// trainer-prefixed key holding a string array — the identifier itself is
// retired, and a repo-wide grep for it proves no live code path remains),
// map the names through FALLBACK_TRAINERS (the only names ever selectable),
// drop unmatched names, and delete the legacy key.
function migrateLegacyTrainerDraft(
  details: Partial<TrainingDetailsValues> & Record<string, unknown>,
): Partial<TrainingDetailsValues> {
  if (Array.isArray(details.trainers)) return details;

  const legacyKey = Object.keys(details).find(
    (key) =>
      key !== 'trainers' &&
      key.startsWith('trainer') &&
      Array.isArray(details[key]) &&
      (details[key] as unknown[]).every((entry) => typeof entry === 'string'),
  );
  if (!legacyKey) return details;

  const legacyNames = details[legacyKey] as string[];
  delete details[legacyKey];
  details.trainers = legacyNames
    .map((name) => FALLBACK_TRAINERS.find((trainer) => trainer.displayName === name))
    .filter((trainer): trainer is TrainerRef => trainer !== undefined);
  return details;
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
  const { data: columns, isLoading: columnsLoading } = useListColumns();
  const { data: trainers = [], isLoading: trainersLoading } = useTrainers();
  const { mutate: submitTraining, isPending } = useTrainingSubmit();

  const [step, setStep] = useState<WizardStep>(1);
  const [trainingDetails, setTrainingDetails] = useState<TrainingDetailsValues | null>(null);
  const [draftTrainingDetails, setDraftTrainingDetails] = useState<Partial<TrainingDetailsValues> | null>(null);
  const [restoredDraftDetails, setRestoredDraftDetails] = useState<Partial<TrainingDetailsValues> | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
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

      const draft = JSON.parse(raw) as HotelTrainingDraft;
      const restoredDetails = draft.trainingDetails
        ? migrateLegacyTrainerDraft({
            ...draft.trainingDetails,
            date: draft.trainingDetails.date ? new Date(draft.trainingDetails.date) : undefined,
          })
        : null;

      setRestoredDraftDetails(restoredDetails);
      setDraftTrainingDetails(restoredDetails);
      setParticipants(draft.participants ?? []);
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
            toast.error(
              `Training saved, but ${result.failedParticipants.length} participant row(s) failed to save. Please retry.`,
            );
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
        {successState === 'full' ? (
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

  const isLoading = colleaguesLoading || columnsLoading || trainersLoading;

  const registerTrainingContent = (
    <div className="mx-auto w-full max-w-2xl space-y-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
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

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Loading training data...
        </div>
      ) : (
        <>
          {step === 1 && (
            <TrainingDetailsForm
              key={detailsFormVersion}
              defaultValues={trainingDetails ?? restoredDraftDetails}
              departments={columns?.departments ?? []}
              trainerOptions={trainers}
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
              <ParticipantsStep
                participants={participants}
                allColleagues={colleagues}
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
                onChange={handleParticipantChange}
              />
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
        </>
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
