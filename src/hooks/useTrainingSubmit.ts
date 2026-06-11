import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  createTrainingSession,
  createParticipants,
  type ParticipantPayload,
} from '@/services/sharepoint';
import type { TrainingDetailsValues, ParticipantRow } from '@/types/hotel-training';

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

type UntypedSupabase = {
  from: (table: string) => {
    insert: (values: unknown) => Promise<{ error: Error | null }>;
    update: (values: unknown) => { eq: (column: string, value: unknown) => Promise<{ error: Error | null }> };
  };
};

const trainingDb = supabase as unknown as UntypedSupabase;

export function useTrainingSubmit() {
  const { session } = useAuth();

  return useMutation<SubmitResult, Error, SubmitInput>({
    mutationFn: async ({ trainingDetails, participants }) => {
      const token = session?.provider_token;
      if (!token) {
        throw new Error('No Microsoft session token. Please sign in again.');
      }

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

      const sharepointId = await createTrainingSession(token, {
        title: trainingDetails.title,
        department: trainingDetails.department,
        durationMinutes: trainingDetails.durationMinutes,
        totalParticipants: trainingDetails.totalParticipants,
        location: trainingDetails.location ?? null,
        remarks: trainingDetails.remarks ?? null,
        trainingDate: isoDate,
        trainerNames: trainingDetails.trainerNames,
      });

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

      const { failed } = await createParticipants(token, rows);

      if (failed.length > 0) {
        return { trainingId, sharepointId, syncStatus: 'partial', failedParticipants: failed };
      }

      const userEmail = session?.user?.email ?? '';
      let syncStatus: 'synced' | 'partial' = 'synced';

      try {
        const { error: sessionError } = await trainingDb.from('training_sessions').insert({
          sharepoint_id: sharepointId,
          training_id: trainingId,
          title: trainingDetails.title,
          department: trainingDetails.department,
          duration_minutes: trainingDetails.durationMinutes,
          location: trainingDetails.location != null ? String(trainingDetails.location) : null,
          remarks: trainingDetails.remarks != null ? String(trainingDetails.remarks) : null,
          training_date: isoDate,
          trainer_names: trainingDetails.trainerNames,
          total_participants: trainingDetails.totalParticipants,
          submitted_by: userEmail,
        });

        if (sessionError) {
          throw sessionError;
        }

        const { error: participantError } = await trainingDb.from('training_participants').insert(
          rows.map((row) => ({
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
          await trainingDb
            .from('training_sessions')
            .update({ sync_status: 'partial' })
            .eq('training_id', trainingId);
          throw participantError;
        }
      } catch (err) {
        syncStatus = 'partial';
        try {
          await trainingDb
            .from('training_sync_queue')
            .insert({
              training_id: trainingId,
              payload: {
                trainingDetails,
                participants: rows,
                sharepointId,
              },
              failure_reason: err instanceof Error ? err.message : String(err),
            });
        } catch {
          // Best-effort sync queue write; SharePoint remains the source of truth.
        }
      }

      return { trainingId, sharepointId, syncStatus, failedParticipants: [] };
    },
  });
}
