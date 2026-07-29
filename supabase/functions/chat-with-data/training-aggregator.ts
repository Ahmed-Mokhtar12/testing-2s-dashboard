// Pure aggregation logic for the query_training_records tool.
// ZERO imports on purpose: this module runs under Deno (edge deploy)
// and under Node 24 type-stripping (unit tests via `node --test`).

export interface DateRangeResult {
  fromISO: string | null;
  toExclusiveISO: string | null;
  swapped: boolean;
  error: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(ymd: string): boolean {
  const d = new Date(`${ymd}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

function addOneDay(ymd: string): string {
  const d = new Date(Date.parse(`${ymd}T00:00:00Z`) + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function buildDateRange(date_from?: string, date_to?: string): DateRangeResult {
  const bad = (which: string, value: string): DateRangeResult => ({
    fromISO: null,
    toExclusiveISO: null,
    swapped: false,
    error: `Invalid ${which} "${value}": must be a real date in YYYY-MM-DD format.`,
  });

  if (date_from !== undefined && (!DATE_RE.test(date_from) || !isRealDate(date_from))) {
    return bad('date_from', date_from);
  }
  if (date_to !== undefined && (!DATE_RE.test(date_to) || !isRealDate(date_to))) {
    return bad('date_to', date_to);
  }

  let from = date_from ?? null;
  let to = date_to ?? null;
  let swapped = false;
  if (from && to && from > to) {
    [from, to] = [to, from];
    swapped = true;
  }

  return {
    fromISO: from ? `${from}T00:00:00+04:00` : null,
    toExclusiveISO: to ? `${addOneDay(to)}T00:00:00+04:00` : null,
    swapped,
    error: null,
  };
}

export interface TrainingSessionRow {
  training_id: string;
  title: string | null;
  department: string | null;
  duration_minutes: number | null;
  location: string | null;
  training_date: string;
  trainer_names: string[] | null;
  total_participants: number | null;
}

export interface TrainingParticipantRow {
  training_id: string;
  employee_id: string | null;
  colleague_name: string | null;
  position: string | null;
  section: string | null;
  department: string | null;
}

export interface TrainingQueryFilters {
  date_from?: string;
  date_to?: string;
  department?: string;
  employee?: string;
  detail?: 'summary' | 'sessions' | 'participants';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function summarize(sessions: TrainingSessionRow[], participants: TrainingParticipantRow[]) {
  const minutes = sessions.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
  const participantIds = new Set(
    participants.map((p) => (p.employee_id ?? '').toLowerCase()).filter(Boolean),
  );
  const trainerNames = new Set(
    sessions.flatMap((s) => s.trainer_names ?? []).map((t) => t.trim()).filter(Boolean),
  );
  return {
    total_sessions: sessions.length,
    total_hours: round1(minutes / 60),
    total_attendances: participants.length,
    distinct_participants: participantIds.size,
    distinct_trainers: trainerNames.size,
    departments_covered: [...new Set(sessions.map((s) => s.department).filter(Boolean))],
  };
}

function sessionView(
  s: TrainingSessionRow,
  participants: TrainingParticipantRow[],
  includePeople: boolean,
) {
  const people = participants.filter((p) => p.training_id === s.training_id);
  const view: Record<string, unknown> = {
    training_id: s.training_id,
    date: s.training_date,
    title: s.title,
    department: s.department,
    duration_minutes: s.duration_minutes ?? 0,
    location: s.location,
    trainers: s.trainer_names ?? [],
    participant_count: people.length,
  };
  if (includePeople) {
    view.participants = people.map((p) => ({
      employee_id: p.employee_id,
      colleague_name: p.colleague_name,
      position: p.position,
      section: p.section,
      department: p.department,
    }));
  }
  return view;
}

export function aggregateTrainingData(
  sessions: TrainingSessionRow[],
  participants: TrainingParticipantRow[],
  filters: TrainingQueryFilters,
  truncated: boolean,
): Record<string, unknown> {
  let scopedSessions = sessions;
  let scopedParticipants = participants;
  let employeeRows: TrainingParticipantRow[] = [];

  if (filters.employee) {
    const needle = filters.employee.trim().toLowerCase();
    employeeRows = participants.filter((p) =>
      (p.employee_id ?? '').toLowerCase() === needle ||
      (p.colleague_name ?? '').toLowerCase().includes(needle)
    );
    const attendedIds = new Set(employeeRows.map((p) => p.training_id));
    scopedSessions = sessions.filter((s) => attendedIds.has(s.training_id));
    scopedParticipants = participants.filter((p) => attendedIds.has(p.training_id));
  }

  const detail = filters.detail ?? 'summary';
  const result: Record<string, unknown> = {
    filters_applied: {
      date_from: filters.date_from ?? null,
      date_to: filters.date_to ?? null,
      department: filters.department ?? null,
      employee: filters.employee ?? null,
      detail,
    },
    summary: summarize(scopedSessions, scopedParticipants),
  };

  if (truncated) result.truncated = true;

  if (scopedSessions.length === 0) {
    result.no_training_records_found = true;
    return result;
  }

  if (!filters.department) {
    const byDept = new Map<string, TrainingSessionRow[]>();
    for (const s of scopedSessions) {
      const key = s.department ?? 'Unknown';
      byDept.set(key, [...(byDept.get(key) ?? []), s]);
    }
    result.by_department = [...byDept.entries()].map(([department, deptSessions]) => {
      const ids = new Set(deptSessions.map((s) => s.training_id));
      const deptParticipants = scopedParticipants.filter((p) => ids.has(p.training_id));
      return { department, ...summarize(deptSessions, deptParticipants) };
    });
  }

  if (detail !== 'summary') {
    result.sessions = scopedSessions.map((s) =>
      sessionView(s, scopedParticipants, detail === 'participants')
    );
  }

  if (filters.employee && employeeRows.length > 0) {
    result.employee_attendance = employeeRows.map((row) => {
      const s = scopedSessions.find((x) => x.training_id === row.training_id);
      return {
        training_id: row.training_id,
        date: s?.training_date ?? null,
        title: s?.title ?? null,
        department: s?.department ?? null,
        duration_minutes: s?.duration_minutes ?? 0,
        employee_id: row.employee_id,
        colleague_name: row.colleague_name,
      };
    });
  }

  return result;
}
