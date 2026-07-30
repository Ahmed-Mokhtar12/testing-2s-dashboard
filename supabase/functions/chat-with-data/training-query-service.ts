import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import {
  aggregateTrainingData,
  buildDateRange,
  TrainingParticipantRow,
  TrainingQueryFilters,
  TrainingSessionRow,
} from './training-aggregator.ts';
import { classifyEmptyResult, emptyResultPayload } from './access-probe.ts';
import { fetchAllWithCap } from './paged-fetch.ts';

export const TRAINING_TOOL_NAME = 'query_training_records';

const SESSION_CAP = 500;
const PARTICIPANT_CAP = 2000;
const DEPARTMENT_SCAN_CAP = 10000;

const UNAVAILABLE = JSON.stringify({
  error: 'Training data is temporarily unavailable. Tell the user you could not access the training records right now.',
});

export class TrainingQueryService {
  private authHeader: string;

  constructor(authHeader?: string) {
    this.authHeader = authHeader ?? '';
  }

  getAvailableFunctions() {
    return [
      {
        name: TRAINING_TOOL_NAME,
        description:
          "Query the hotel's staff training records (sessions registered through the dashboard). Returns EXACT computed statistics: total sessions, total training hours, attendances, distinct participants, distinct trainers, per-department breakdown, and optional session/participant details. ALWAYS use this tool for ANY question about staff training hours, sessions, participants, attendees, or trainers. Never estimate training numbers yourself.",
        parameters: {
          type: 'object',
          properties: {
            date_from: {
              type: 'string',
              description: 'Start date (inclusive), format YYYY-MM-DD, Dubai time. Omit for no lower bound.',
            },
            date_to: {
              type: 'string',
              description: 'End date (inclusive), format YYYY-MM-DD, Dubai time. Omit for no upper bound.',
            },
            department: {
              type: 'string',
              description: "Department name, partial match allowed (e.g. 'Front Office', 'Housekeeping', 'F&B').",
            },
            employee: {
              type: 'string',
              description: "Employee ID (exact) or colleague name (partial) to get one person's training history.",
            },
            detail: {
              type: 'string',
              enum: ['summary', 'sessions', 'participants'],
              description:
                'summary (default): totals only. sessions: also list each session. participants: also include participant names per session.',
            },
          },
          required: [],
        },
      },
    ];
  }

  async executeFunction(functionName: string, args: any): Promise<string> {
    if (functionName !== TRAINING_TOOL_NAME) {
      return JSON.stringify({ error: `Unknown function: ${functionName}` });
    }

    try {
      const filters: TrainingQueryFilters = {
        date_from: typeof args?.date_from === 'string' && args.date_from ? args.date_from : undefined,
        date_to: typeof args?.date_to === 'string' && args.date_to ? args.date_to : undefined,
        department: typeof args?.department === 'string' && args.department.trim() ? args.department.trim() : undefined,
        employee: typeof args?.employee === 'string' && args.employee.trim() ? args.employee.trim() : undefined,
        detail: ['summary', 'sessions', 'participants'].includes(args?.detail) ? args.detail : 'summary',
      };

      const range = buildDateRange(filters.date_from, filters.date_to);
      if (range.error) {
        return JSON.stringify({ error: range.error });
      }

      // User-scoped client (anon key + caller JWT) so training-records RLS
      // applies to the caller, matching the rest of chat-with-data.
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: this.authHeader } } },
      );

      let query = supabase
        .from('training_sessions')
        .select('training_id, title, department, duration_minutes, location, training_date, trainer_names, total_participants')
        .order('training_date', { ascending: false })
        .limit(SESSION_CAP);
      if (range.fromISO) query = query.gte('training_date', range.fromISO);
      if (range.toExclusiveISO) query = query.lt('training_date', range.toExclusiveISO);
      if (filters.department) query = query.ilike('department', `%${filters.department}%`);

      const { data: sessions, error: sessionsError } = await query;
      if (sessionsError) {
        console.error('❌ query_training_records sessions query failed:', sessionsError);
        return UNAVAILABLE;
      }

      const sessionRows = (sessions ?? []) as TrainingSessionRow[];

      // No sessions visible to this user-scoped query. Rather than assert
      // "no records exist" (RLS can silently hide rows behind an identical
      // empty result), probe existence with the service role and classify.
      if (sessionRows.length === 0) {
        const { rows: deptRows, error: deptError } = await fetchAllWithCap<any>((from, to, withCount) =>
          supabase
            .from('training_sessions')
            .select('department', withCount ? { count: 'exact' } : {})
            .order('department', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
          DEPARTMENT_SCAN_CAP);
        if (deptError) {
          console.error('❌ query_training_records department scan failed:', deptError);
        }
        // A non-admin's user-scoped scan legitimately sees none — omit the
        // key entirely rather than claim an empty list of departments.
        const departmentsAvailable = deptError
          ? []
          : [...new Set(deptRows.map((r: any) => r.department).filter(Boolean))];

        const kind = await classifyEmptyResult('training_sessions', (q) => {
          if (range.fromISO) q = q.gte('training_date', range.fromISO);
          if (range.toExclusiveISO) q = q.lt('training_date', range.toExclusiveISO);
          if (filters.department) q = q.ilike('department', `%${filters.department}%`);
          return q;
        });
        return emptyResultPayload(kind, {
          date_from: filters.date_from ?? null,
          date_to: filters.date_to ?? null,
          ...(departmentsAvailable.length ? { departments_available: departmentsAvailable } : {}),
        });
      }

      // sessionRows is non-empty here — the empty case already returned above.
      const ids = sessionRows.map((s) => s.training_id);
      const { rows: participantRows, exactCount: participantsExact, error: participantsError } = await fetchAllWithCap<TrainingParticipantRow>((from, to, withCount) =>
        supabase
          .from('training_participants')
          .select('training_id, employee_id, colleague_name, position, section, department', withCount ? { count: 'exact' } : {})
          .in('training_id', ids)
          .order('id', { ascending: true })
          .range(from, to),
        PARTICIPANT_CAP);
      if (participantsError) {
        console.error('❌ query_training_records participants query failed:', participantsError);
        return UNAVAILABLE;
      }

      const truncated = sessionRows.length >= SESSION_CAP ||
        (participantsExact !== null ? participantsExact > participantRows.length : participantRows.length >= PARTICIPANT_CAP);
      const result = aggregateTrainingData(sessionRows, participantRows, filters, truncated);
      if (truncated) {
        result.truncation_note = 'Result capped. You MUST tell the user the totals cover only the most recent records in range, and suggest narrowing the date range for exact totals.';
      }
      if (range.swapped) {
        result.note = 'date_from and date_to were reversed and have been swapped.';
      }

      console.log('🎓 query_training_records:', {
        filters,
        sessions: sessionRows.length,
        participants: participantRows.length,
        truncated,
      });
      return JSON.stringify(result);
    } catch (error) {
      console.error('❌ query_training_records failed:', error);
      return UNAVAILABLE;
    }
  }
}
