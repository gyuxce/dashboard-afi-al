import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import { agentAverage, agentGap, bottomThreeAgentIds, buildWeekGrid, formatDayMonth, sortProductivityAgents, summarizeDays, summarizeProductivity } from '../productivityStats';

const agent = (csId: string, total: number, manDays: number, base = total): AgentKPI =>
  ({ csId, name: csId, bpo: 'NSI', teamLeader: 'X', productivityTotal: total, manDays, productivityBase: base }) as unknown as AgentKPI;

describe('summarizeProductivity', () => {
  const data = [agent('a', 1300, 10), agent('b', 900, 10), agent('c', 0, 0, 0)];

  it('adds up the team over agents that have productivity', () => {
    const s = summarizeProductivity(data);
    expect(s).toMatchObject({ totalChat: 2200, totalManDays: 20, activeAgents: 2, totalQuota: 2000, totalGap: 200, underTarget: 1 });
    expect(s.totalAvg).toBe(110);
    expect(s.quotaAchievement).toBeCloseTo(110, 5);
  });

  it('is all zeros for an empty team (no division by zero)', () => {
    expect(summarizeProductivity([])).toMatchObject({ totalChat: 0, totalAvg: 0, quotaAchievement: 0, totalGap: 0, activeAgents: 0 });
  });

  it('matches the October numbers on the dashboard: 63.121 chat / 515 man-day', () => {
    const s = summarizeProductivity([agent('team', 63121, 515)]);
    expect(s.totalAvg).toBeCloseTo(122.565, 2);
    expect(s.totalQuota).toBe(51500);
    expect(s.totalGap).toBe(11621);
    expect(s.quotaAchievement).toBeCloseTo(122.565, 2);
  });
});

describe('agent helpers', () => {
  it('average and gap per agent', () => {
    expect(agentAverage(agent('a', 1300, 10))).toBe(130);
    expect(agentAverage(agent('a', 0, 0))).toBe(0);
    expect(agentGap(agent('a', 1300, 10))).toBe(300);
    expect(agentGap(agent('a', 900, 10))).toBe(-100);
  });
});

describe('sortProductivityAgents', () => {
  const list = [agent('b', 900, 10), agent('a', 1300, 10), agent('c', 1000, 5)];

  it('ranks by average per man-day, best first, when no column is chosen', () => {
    expect(sortProductivityAgents(list, null).map((a) => a.csId)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by the chosen column and direction', () => {
    expect(sortProductivityAgents(list, { key: 'total', direction: 'asc' }).map((a) => a.csId)).toEqual(['b', 'c', 'a']);
    expect(sortProductivityAgents(list, { key: 'name', direction: 'desc' }).map((a) => a.csId)).toEqual(['c', 'b', 'a']);
    expect(sortProductivityAgents(list, { key: 'gap', direction: 'desc' }).map((a) => a.csId)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate the input', () => {
    const copy = [...list];
    sortProductivityAgents(list, null);
    expect(list).toEqual(copy);
  });
});

describe('bottomThreeAgentIds', () => {
  it('lists the three lowest averages, ignoring agents without man-days', () => {
    const list = [agent('a', 1300, 10), agent('b', 900, 10), agent('c', 800, 10), agent('d', 700, 10), agent('e', 100, 0)];
    expect(bottomThreeAgentIds(list)).toEqual(['d', 'c', 'b']);
  });
});

describe('buildWeekGrid', () => {
  it('places days Monday-first and pads the partial weeks with null', () => {
    // 2026-10-01 is a Thursday, 2026-10-05 a Monday.
    const grid = buildWeekGrid([
      { date: '2026-10-01', value: 120 },
      { date: '2026-10-04', value: null },
      { date: '2026-10-05', value: 90, marker: '22' },
    ]);
    expect(grid).toHaveLength(2);
    expect(grid![0].map((c) => c?.date ?? null)).toEqual([null, null, null, '2026-10-01', null, null, '2026-10-04']);
    expect(grid![1][0]).toMatchObject({ date: '2026-10-05', value: 90, marker: '22' });
    expect(grid![1].slice(1).every((c) => c === null)).toBe(true);
  });

  it('returns null when a date is not ISO, and [] for no days', () => {
    expect(buildWeekGrid([{ date: '13/8/2026', value: 1 }])).toBeNull();
    expect(buildWeekGrid([])).toEqual([]);
  });
});

describe('summarizeDays', () => {
  it('counts days under target and finds the extremes, ignoring empty days', () => {
    const s = summarizeDays([
      { date: '2026-10-01', value: 120 },
      { date: '2026-10-02', value: 42 },
      { date: '2026-10-03', value: null },
      { date: '2026-10-04', value: 99 },
      { date: '2026-10-05', value: 202 },
    ]);
    expect(s).toEqual({
      daysWithData: 4,
      belowTarget: 2,
      lowest: { date: '2026-10-02', value: 42 },
      highest: { date: '2026-10-05', value: 202 },
    });
  });

  it('treats exactly the target as met, and handles no data', () => {
    expect(summarizeDays([{ date: '2026-10-01', value: 100 }]).belowTarget).toBe(0);
    expect(summarizeDays([{ date: '2026-10-01', value: null }])).toEqual({ daysWithData: 0, belowTarget: 0, lowest: null, highest: null });
  });
});

describe('formatDayMonth', () => {
  it('uses Indonesian month abbreviations', () => {
    expect(formatDayMonth('2026-10-14')).toBe('14 Okt');
    expect(formatDayMonth('2026-08-01')).toBe('1 Agu');
    expect(formatDayMonth('weird')).toBe('weird');
  });
});
