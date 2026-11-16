import type { AgentKPI } from './dataProcessor';
import { KPI_TARGETS, getByCalendarDate, indexByDate } from './utils';

/** Agents with any attendance signal: avoids listing empty roster-only records. */
export const hasAttendanceData = (a: AgentKPI) =>
  a.attendanceDuty > 0 || a.attendancePresence > 0 || a.attendanceS > 0 || a.attendanceC > 0 || a.attendancePullout > 0;

/** Team attendance (capped at 100), leave / sick / pullout totals, and how many agents are under the attendance target. */
export function summarizeAttendance(rows: AgentKPI[]) {
  let totDuty = 0;
  let totPresence = 0;
  let sick = 0;
  let pullout = 0;
  let leaveDays = 0;
  let belowTarget = 0;
  rows.forEach((a) => {
    totDuty += a.attendanceDuty;
    totPresence += a.attendancePresence;
    sick += a.attendanceS;
    pullout += a.attendancePullout;
    leaveDays += a.attendanceC;
    if (a.attendanceDuty > 0 && a.attendanceScore < KPI_TARGETS.attendance) belowTarget += 1;
  });
  return {
    avgTeamAttendance: totDuty > 0 ? Math.min(100, (totPresence / totDuty) * 100) : 0,
    totalSick: sick,
    totalPullout: pullout,
    totalC: leaveDays,
    belowTarget,
  };
}

export type ShiftKind = 'shift' | 'sick' | 'off' | 'pullout' | 'none' | 'other';

/** One roster cell to a kind plus the label to print (see BUSINESS_RULES: numeric shifts and S are man-days, OFF/C are not, PULLOUT is duty only). */
export function classifyShift(raw: string | null | undefined): { kind: ShiftKind; label: string } {
  const s = (raw || '').trim();
  const u = s.toUpperCase();
  if (!s || s === '-') return { kind: 'none', label: '–' };
  if (u === 'S') return { kind: 'sick', label: 'S' };
  if (u === 'OFF' || u === 'C') return { kind: 'off', label: u };
  if (u === 'PULLOUT' || u === 'P.OUT' || u === 'PO') return { kind: 'pullout', label: 'P.OUT' };
  if (/^\d+([.,]\d+)?$/.test(u) || /^\d{1,2}:\d{2}/.test(u)) return { kind: 'shift', label: s };
  return { kind: 'other', label: s };
}

/** For each calendar day (newest first), how many agents are on a numeric shift. */
export function buildCoverage(data: AgentKPI[], dates: string[]): { date: string; count: number }[] {
  return dates.map((date) => {
    let count = 0;
    for (const a of data) {
      const sched = getByCalendarDate(indexByDate(a.dailyHistory?.schedule), date);
      if (sched && classifyShift(sched.status).kind === 'shift') count++;
    }
    return { date, count };
  });
}
