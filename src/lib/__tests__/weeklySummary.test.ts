import { describe, expect, it } from 'vitest';
import { buildWeeklySummary, type SummaryInput } from '../weeklySummary';

const stats = (over: Record<string, number> = {}) => ({
  productivity: 13495, avgProductivity: 115, csat: 3.59, csatScFull: 66.96, csatScFair: 78.62,
  sla1m: 98.5, sla3m: 99.79, whu: 99.66, qa: 96.18, attendance: 98.29, ...over,
});

const agent = (name: string, csId: string, badCount: number, cause: string) => ({
  name, csId, badCount, topCategories: [{ name: cause, count: badCount }],
});

const base = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  label: 'W2 Nov',
  prevLabel: 'W1 Nov',
  lastStats: stats(),
  prevStats: stats({ csat: 3.63, csatScFull: 68.2, csatScFair: 77.61, qa: 95.84, attendance: 99.12, productivity: 13633, avgProductivity: 120 }),
  csat: {
    last: {
      respondents: 1321, bad: 120, topCategory: { rank: 1, name: 'Tidak Bisa Transaksi Namun Memiliki Limit', count: 70, goodPct: null, isTakeout: false },
      agents: [agent('Sofyan', 'a', 27, 'X'), agent('Farchan', 'b', 27, 'X'), agent('Vania', 'c', 26, 'Y')],
    },
    prev: { respondents: 1400, bad: 110, agents: [agent('Farchan', 'b', 32, 'X')] },
  },
  ...over,
});

describe('buildWeeklySummary', () => {
  it('counts a KPI as achieved only when it reaches its target (CSAT Official 3,59 < 3,75 is not)', () => {
    const s = buildWeeklySummary(base());
    expect(s.kpi.total).toBe(9);
    expect(s.kpi.achieved).toBe(6);
    expect(s.kpi.below.map((b) => b.label)).toEqual(['CSAT SC After Takeout', 'CSAT SC Full', 'CSAT Official']);
    expect(s.kpi.below[0]).toMatchObject({ valueText: '78,62%', targetText: '92%', gapText: '−13,38' });
    expect(s.kpi.prevAchieved).toBe(6);
  });

  it('uses the same biggest up / down as the Overview highlight (percent and score KPIs, absolute change)', () => {
    const s = buildWeeklySummary(base());
    expect(s.moves.up[0]).toEqual({ label: 'CSAT SC After Takeout', deltaText: '+1,01 poin' });
    expect(s.moves.down[0]).toEqual({ label: 'CSAT SC Full', deltaText: '−1,24 poin' });
    expect(s.moves.productivity.map((p) => p.delta)).toEqual([-138, -5]);
  });

  it('flags agents that were also in the previous top list and names the common cause', () => {
    const s = buildWeeklySummary(base());
    expect(s.agents.top.map((a) => [a.name, a.repeated])).toEqual([['Sofyan', false], ['Farchan', true], ['Vania', false]]);
    expect(s.agents.commonCause).toEqual({ name: 'X', agents: 2, of: 3 });
  });

  it('writes a good headline when every KPI with a target is reached', () => {
    const s = buildWeeklySummary(base({ lastStats: stats({ csat: 3.8, csatScFull: 80, csatScFair: 93 }) }));
    expect(s.headline).toEqual({ text: 'Semua 9 KPI bertarget tercapai di W2 Nov', tone: 'good' });
  });

  it('works without a previous period (first column only)', () => {
    const s = buildWeeklySummary(base({ prevLabel: null, prevStats: null, csat: { last: base().csat.last, prev: null } }));
    expect(s.kpi.prevAchieved).toBeNull();
    expect(s.moves.up).toEqual([]);
    expect(s.csat.respondentsDelta).toBeNull();
    expect(s.lines.length).toBeGreaterThan(0);
  });

  it('reports the bad-rating share of respondents', () => {
    const s = buildWeeklySummary(base());
    expect(s.csat.badShare).toBeCloseTo((120 / 1321) * 100, 5);
    expect(s.csat.badDelta).toBe(10);
  });
});
