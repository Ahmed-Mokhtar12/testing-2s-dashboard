// Pure metrics for training report emails. ZERO imports: runs under Deno
// (edge deploy) and Node type-stripping (unit tests) alike.
//
// Attribution rule: every session's man-hours, trainers, and attendees are
// credited to the SESSION's own department — never the participant's home
// department (a participant row carries no department of its own here).

export interface ReportSessionRow {
  training_id: string;
  department: string | null;
  duration_minutes: number | null;
  total_participants: number | null;
  sync_status: string | null;
}
export interface ReportParticipantRow {
  training_id: string;
  employee_id: string | null;
}
export interface TargetRow { department: string; monthly_target_hours: number | null; }
export interface DeptReportRow {
  department: string;
  trainers: number;
  colleagues: number;
  manHours: number;              // 1 decimal
  target: number | null;
  pctOfTarget: number | null;    // null when no target
}
export interface ReportData {
  rows: DeptReportRow[];         // manHours desc, then department asc
  totals: { sessions: number; trainers: number; colleagues: number; manHours: number };
  anyTargetSet: boolean;
  dataQualityNote: string | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface DeptAccumulator {
  trainers: Set<string>;
  colleagues: Set<string>;
  manMinutes: number;
}

export function aggregateReport(
  sessions: (ReportSessionRow & { trainer_names: string[] | null })[],
  participants: ReportParticipantRow[],
  targets: TargetRow[],
): ReportData {
  // Raw participant-row count per session (not deduped: man-hours are
  // duration x attendance rows, so repeat rows for the same person count).
  const rowCountByTraining = new Map<string, number>();
  for (const p of participants) {
    const key = p.training_id;
    rowCountByTraining.set(key, (rowCountByTraining.get(key) ?? 0) + 1);
  }

  const deptByTraining = new Map<string, string>();
  for (const s of sessions) {
    deptByTraining.set(s.training_id, s.department ?? 'Unknown');
  }

  const byDept = new Map<string, DeptAccumulator>();
  const getAcc = (dept: string): DeptAccumulator => {
    let acc = byDept.get(dept);
    if (!acc) {
      acc = { trainers: new Set(), colleagues: new Set(), manMinutes: 0 };
      byDept.set(dept, acc);
    }
    return acc;
  };

  const allTrainers = new Set<string>();
  let mismatchCount = 0;

  for (const s of sessions) {
    const dept = s.department ?? 'Unknown';
    const acc = getAcc(dept);
    const rowCount = rowCountByTraining.get(s.training_id) ?? 0;
    acc.manMinutes += (s.duration_minutes ?? 0) * rowCount;

    for (const raw of s.trainer_names ?? []) {
      const name = raw.trim().toLowerCase();
      if (!name) continue;
      acc.trainers.add(name);
      allTrainers.add(name);
    }

    if (s.sync_status !== 'synced' || (s.total_participants != null && s.total_participants !== rowCount)) {
      mismatchCount++;
    }
  }

  const allColleagues = new Set<string>();
  for (const p of participants) {
    const empId = (p.employee_id ?? '').toLowerCase();
    if (!empId) continue;
    allColleagues.add(empId);
    const dept = deptByTraining.get(p.training_id);
    if (dept !== undefined) getAcc(dept).colleagues.add(empId);
  }

  const targetByDept = new Map<string, number | null>();
  for (const t of targets) targetByDept.set(t.department, t.monthly_target_hours);

  // Row universe = union(target departments, departments active this period).
  const universe = new Set<string>([...targetByDept.keys(), ...byDept.keys()]);

  const rows: DeptReportRow[] = [...universe].map((department) => {
    const acc = byDept.get(department);
    const manHours = round1((acc?.manMinutes ?? 0) / 60);
    const target = targetByDept.get(department) ?? null;
    const pctOfTarget = target ? Math.round((manHours / target) * 100) : null;
    return {
      department,
      trainers: acc?.trainers.size ?? 0,
      colleagues: acc?.colleagues.size ?? 0,
      manHours,
      target,
      pctOfTarget,
    };
  });

  rows.sort((a, b) => b.manHours - a.manHours || a.department.localeCompare(b.department));

  const totals = {
    sessions: sessions.length,
    trainers: allTrainers.size,
    colleagues: allColleagues.size,
    manHours: round1(rows.reduce((sum, r) => sum + r.manHours, 0)),
  };

  const anyTargetSet = targets.some((t) => t.monthly_target_hours != null);

  const dataQualityNote = mismatchCount > 0
    ? `${mismatchCount} session(s) have incomplete mirror data — Postgres mirrors SharePoint (the source of truth); figures may undercount.`
    : null;

  return { rows, totals, anyTargetSet, dataQualityNote };
}
