import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import { KPI_TARGETS } from '../utils';
import { buildCoverage, classifyShift, hasAttendanceData, summarizeAttendance } from '../scheduleStats';

const agent = (over: Record<string, unknown> = {}): AgentKPI =>
  ({
    csId: 'a', attendanceDuty: 0, attendancePresence: 0, attendanceS: 0, attendanceC: 0, attendancePullout: 0, attendanceScore: 0,
    dailyHistory: { schedule: [] },
    ...over,
  }) as unknown as AgentKPI;

describe('hasAttendanceData', () => {
  it('is false for a roster-only agent and true for any attendance signal', () => {
    expect(hasAttendanceData(agent())).toBe(false);
    for (const k of ['attendanceDuty', 'attendancePresence', 'attendanceS', 'attendanceC', 'attendancePullout']) {
      expect(hasAttendanceData(agent({ [k]: 1 }))).toBe(true);
    }
  });
});

describe('summarizeAttendance', () => {
  it('returns zeros for no duty', () => {
    expect(summarizeAttendance([])).toEqual({ avgTeamAttendance: 0, totalSick: 0, totalPullout: 0, totalC: 0, belowTarget: 0 });
  });

  it('pools presence over duty, sums S / C / pullout, and counts agents under target', () => {
    const rows = [
      agent({ attendanceDuty: 20, attendancePresence: 19, attendanceS: 1, attendanceScore: KPI_TARGETS.attendance + 1 }),
      agent({ attendanceDuty: 20, attendancePresence: 15, attendanceC: 2, attendancePullout: 3, attendanceScore: KPI_TARGETS.attendance - 1 }),
    ];
    const s = summarizeAttendance(rows);
    expect(s.avgTeamAttendance).toBe(85);
    expect(s.totalSick).toBe(1);
    expect(s.totalC).toBe(2);
    expect(s.totalPullout).toBe(3);
    expect(s.belowTarget).toBe(1);
  });

  it('caps team attendance at 100 and ignores agents without duty for the below-target count', () => {
    const s = summarizeAttendance([agent({ attendanceDuty: 10, attendancePresence: 12, attendanceScore: 120 }), agent({ attendanceScore: 0 })]);
    expect(s.avgTeamAttendance).toBe(100);
    expect(s.belowTarget).toBe(0);
  });
});

describe('classifyShift', () => {
  it('maps roster codes', () => {
    expect(classifyShift('7')).toEqual({ kind: 'shift', label: '7' });
    expect(classifyShift('22')).toEqual({ kind: 'shift', label: '22' });
    expect(classifyShift('07:00')).toEqual({ kind: 'shift', label: '07:00' });
    expect(classifyShift('s')).toEqual({ kind: 'sick', label: 'S' });
    expect(classifyShift('off')).toEqual({ kind: 'off', label: 'OFF' });
    expect(classifyShift('c')).toEqual({ kind: 'off', label: 'C' });
    expect(classifyShift('PULLOUT')).toEqual({ kind: 'pullout', label: 'P.OUT' });
    expect(classifyShift('po')).toEqual({ kind: 'pullout', label: 'P.OUT' });
  });

  it('treats blank, dash and null as none, unknown text as other', () => {
    expect(classifyShift('')).toEqual({ kind: 'none', label: '–' });
    expect(classifyShift('-')).toEqual({ kind: 'none', label: '–' });
    expect(classifyShift(null)).toEqual({ kind: 'none', label: '–' });
    expect(classifyShift('Training')).toEqual({ kind: 'other', label: 'Training' });
  });
});

describe('buildCoverage', () => {
  const day = (date: string, status: string) => ({ date, normDate: date, status });
  const a = agent({ dailyHistory: { schedule: [day('2026-10-02', '7'), day('2026-10-01', 'OFF')] } });
  const b = agent({ dailyHistory: { schedule: [day('2026-10-02', '22'), day('2026-10-01', 'S')] } });

  it('counts only numeric shifts per day, in the order of the given dates', () => {
    expect(buildCoverage([a, b], ['2026-10-02', '2026-10-01'])).toEqual([
      { date: '2026-10-02', count: 2 },
      { date: '2026-10-01', count: 0 },
    ]);
  });
});
