import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { invokeSubmitTraining, type ParticipantPayload } from '@/services/sharepoint';
import { toTrainerNames } from '@/lib/trainer-names';
import type { TrainingDetailsValues, ParticipantRow } from '@/types/hotel-training';
import type { Json } from '@/integrations/supabase/types';

function generateTrainingId(): string {
  const now = new Date();
  const pad = (n: number, d = 2) => String(n).padStart(d, '0');
  return `TRN-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export interface SubmitInput {
  trainingDetails: TrainingDetailsValues;
  participants: ParticipantRow[];
}

export interface SubmitResult {
  trainingId: string;
  sharepointId: string;
  syncStatus: 'synced' | 'partial';
  failedParticipants: Array<{ row: ParticipantPayload; error: string }>;
}

export function useTrainingSubmit() {
  const { session } = useAuth();

  return useMutation<SubmitResult, Error, SubmitInput>({
    mutationFn: async ({ trainingDetails, participants }) => {
      const completed = participants.filter((participant) => participant.colleague !== null);
      if (completed.length !== trainingDetails.totalParticipants) {
        throw new Error(
          `Participant count mismatch: expected ${trainingDetails.totalParticipants}, got ${completed.length}`,
        );
      }

      const date = new Date(trainingDetails.date);
      date.setHours(trainingDetails.hour, trainingDetails.minute, 0, 0);
      const isoDate = date.toISOString();
      const trainingId = generateTrainingId();

      // COMPUTED ONCE, USED FOR BOTH DESTINATIONS. This is the whole reason the client
      // sends names rather than having the edge function resolve them: SharePoint's
      // TrainerNames column is written by the function from this request, while
      // training_sessions.trainer_names is written by the block below — from the client.
      // Two independent resolutions would disagree in exactly the case server-side
      // resolution exists to prevent, and the monthly report reads the client's copy.
      // One fact, one writer, one local.
      const trainerNames = toTrainerNames(trainingDetails.trainers);

      const rows: ParticipantPayload[] = completed.map((participant, index) => {
        const colleague = participant.colleague;
        if (!colleague) {
          throw new Error('Participant row is missing a colleague.');
        }

        return {
          trainingId,
          rowNo: index + 1,
          employeeId: colleague.employeeId,
          colleagueName: colleague.colleagueName,
          position: colleague.position,
          section: colleague.section,
          department: colleague.department,
        };
      });

      const { sharepointId, failedParticipants } = await invokeSubmitTraining({
        trainingId,
        title: trainingDetails.title,
        department: trainingDetails.department,
        durationMinutes: trainingDetails.durationMinutes,
        totalParticipants: trainingDetails.totalParticipants,
        location: trainingDetails.location ?? null,
        remarks: trainingDetails.remarks ?? null,
        trainingDate: isoDate,
        trainerColleagueNames: trainerNames,
        participants: rows,
      });

      const failed = failedParticipants;

      // A SharePoint participant failure USED TO return here, before any of the
      // Supabase writes below. The effect was that a single failed row lost the
      // whole session from the database: no training_sessions row, no
      // training_participants, and no training_sync_queue row either — that
      // write lives in the catch of the block below, which the early return
      // skipped. The session was not "partial" in the database, it was ABSENT,
      // and training_sessions is what the training report reads, so the session
      // appeared in no report at all and sync_status never said anything.
      //
      // At 15 participants a single row failure was unlikely enough that this
      // stayed theoretical (training_sync_queue has never held a row). At 100 it
      // becomes routine, so the cap could not be raised over it.
      //
      // Now: the session is always mirrored, marked 'partial', with the rows
      // that DID land — and the failures are recorded for a human.
      const failedRowNos = new Set(failed.map((entry) => entry.row.rowNo));
      const landedRows = rows.filter((row) => !failedRowNos.has(row.rowNo));
      const sharePointPartial = failed.length > 0;

      const userEmail = session?.user?.email ?? '';
      let syncStatus: 'synced' | 'partial' = sharePointPartial ? 'partial' : 'synced';

      // Recorded first and independently: training_sync_queue has no foreign key
      // to training_sessions, so this survives even if every write below fails.
      // NOTE for whoever reads this next: nothing DRAINS this queue. It is an
      // admin-readable record that something needs doing by hand, not an
      // automatic retry.
      if (sharePointPartial) {
        try {
          await supabase.from('training_sync_queue').insert({
            training_id: trainingId,
            payload: { trainingDetails, participants: failed.map((entry) => entry.row), sharepointId } as unknown as Json,
            failure_reason:
              `${failed.length} of ${rows.length} participant row(s) failed to write to SharePoint: `
              + failed.map((entry) => `row ${entry.row.rowNo} (${entry.row.employeeId}): ${entry.error}`).join('; '),
          });
        } catch {
          // Best-effort; SharePoint remains the source of truth.
        }
      }

      try {
        const { error: sessionError } = await supabase.from('training_sessions').insert({
          sharepoint_id: sharepointId,
          training_id: trainingId,
          title: trainingDetails.title,
          department: trainingDetails.department,
          duration_minutes: trainingDetails.durationMinutes,
          location: trainingDetails.location != null ? String(trainingDetails.location) : null,
          remarks: trainingDetails.remarks != null ? String(trainingDetails.remarks) : null,
          training_date: isoDate,
          trainer_names: trainerNames,
          // The DECLARED count, deliberately — NOT landedRows.length. This is
          // what makes the gap detectable: report-aggregator.ts flags a session
          // when sync_status !== 'synced' OR total_participants !== the number of
          // participant rows found. Writing the landed count here would make the
          // row look internally consistent and hide the missing people.
          total_participants: trainingDetails.totalParticipants,
          sync_status: syncStatus,
          submitted_by: userEmail,
        });

        if (sessionError) {
          throw sessionError;
        }

        // Only the rows SharePoint accepted. Inserting the failed ones would
        // claim people were recorded who were not, and would then AGREE with
        // total_participants — defeating the aggregator's mismatch check.
        // Guarded: .insert([]) on a partial where every row failed is a
        // pointless round-trip, and PostgREST's response to it is not worth
        // depending on.
        const { error: participantError } = landedRows.length === 0
          ? { error: null }
          : await supabase.from('training_participants').insert(
            landedRows.map((row) => ({
              training_id: trainingId,
              row_no: row.rowNo,
              employee_id: row.employeeId,
              colleague_name: row.colleagueName,
              position: row.position,
              section: row.section,
              department: row.department,
            })),
          );

        if (participantError) {
          await supabase
            .from('training_sessions')
            .update({ sync_status: 'partial' })
            .eq('training_id', trainingId);
          throw participantError;
        }
      } catch (err) {
        syncStatus = 'partial';
        try {
          await supabase
            .from('training_sync_queue')
            .insert({
              training_id: trainingId,
              payload: {
                trainingDetails,
                participants: rows,
                sharepointId,
              } as unknown as Json,
              failure_reason: err instanceof Error ? err.message : String(err),
            });
        } catch {
          // Best-effort sync queue write; SharePoint remains the source of truth.
        }
      }

      // `failed`, not []. The old code could only reach this line when nothing
      // had failed, so a literal [] was correct then and is a lie now — the UI
      // decides what to tell the operator from this array.
      return { trainingId, sharepointId, syncStatus, failedParticipants: failed };
    },
  });
}
