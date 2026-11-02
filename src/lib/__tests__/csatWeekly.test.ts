import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import {
  dailyRespondents,
  positiveRates,
  respondentStats,
  topBadAgents,
  topBadCategories,
} from '../csatWeekly';

type Entry = { score: number; category: string; isTakeout?: boolean; normDate?: string };

const agent = (csId: string, entries: Entry[], extra: Partial<AgentKPI> = {}): AgentKPI =>
  ({
    csId,
    name: csId,
    teamLeader: 'TL',
    csatHistory: entries.map((e) => ({ date: e.normDate || '', normDate: e.normDate, isTakeout: false, ...e })),
    csatScGoodCount: 0,
    csatScTotalValid: 0,
    csatScFairGoodCount: 0,
    csatScFairTotalValid: 0,
    csatScFullCount: entries.length,
    csatScFairCount: entries.length,
    csatScBadScoreFullCount: 0,
    csatScBadScoreFairCount: 0,
    csatScCategoriesFull: {},
    csatScCategoriesFair: {},
    ...extra,
  }) as unknown as AgentKPI;

describe('positiveRates', () => {
  it('is good ÷ valid for Full and for After Takeout', () => {
    const rows = [
      agent('a', [], { csatScGoodCount: 6, csatScTotalValid: 8, csatScFairGoodCount: 3, csatScFairTotalValid: 4 }),
      agent('b', [], { csatScGoodCount: 2, csatScTotalValid: 2, csatScFairGoodCount: 1, csatScFairTotalValid: 1 }),
    ];
    const r = positiveRates(rows);
    expect(r.full).toBeCloseTo(80); // 8 / 10
    expect(r.fair).toBeCloseTo(80); // 4 / 5
  });

  it('is null without any valid rating', () => {
    expect(positiveRates([agent('a', [])])).toEqual({ full: null, fair: null });
  });
});

describe('respondentStats', () => {
  const rows = [
    agent('a', [
      { score: 5, category: 'x' },
      { score: 1, category: 'x' },
      { score: 3, category: 'y', isTakeout: true },
      { score: 0, category: 'y' }, // no survey: processed but not a respondent
    ]),
  ];

  it('counts every ticket as processed and ratings 1–5 as respondents', () => {
    const s = respondentStats(rows, 'full');
    expect(s.processed).toBe(4);
    expect(s.respondents).toBe(3);
    expect(s.stars).toEqual([1, 0, 1, 0, 1]);
    expect(s.rate).toBeCloseTo(75);
  });

  it('drops takeout tickets in fair mode', () => {
    const s = respondentStats(rows, 'fair');
    expect(s.processed).toBe(3);
    expect(s.respondents).toBe(2);
  });
});

describe('dailyRespondents', () => {
  it('groups respondents per day in ascending order', () => {
    const rows = [
      agent('a', [
        { score: 5, category: 'x', normDate: '2026-10-27' },
        { score: 4, category: 'x', normDate: '2026-10-26' },
        { score: 2, category: 'x', normDate: '2026-10-27' },
        { score: 0, category: 'x', normDate: '2026-10-28' },
      ]),
    ];
    expect(dailyRespondents(rows, 'full')).toEqual([
      { date: '2026-10-26', respondents: 1 },
      { date: '2026-10-27', respondents: 2 },
    ]);
  });
});

describe('topBadCategories', () => {
  const rows = [
    agent('a', [
      { score: 1, category: 'Kendala QRIS' },
      { score: 2, category: 'kendala  qris' },
      { score: 5, category: 'Kendala QRIS' },
      { score: 1, category: 'Tidak bisa transaksi namun memiliki limit' },
      { score: 3, category: 'Kendala QRIS' }, // rating 3 is not valid, ignored
    ]),
  ];

  it('ranks by bad ratings, merges spelling variants and reports the good share', () => {
    const top = topBadCategories(rows, 'full', 10);
    expect(top[0]).toMatchObject({ name: 'Kendala QRIS', count: 2, rank: 1, isTakeout: false });
    expect(top[0].goodPct).toBeCloseTo((1 / 3) * 100);
    expect(top[1]).toMatchObject({ rank: 2, count: 1, isTakeout: true });
  });

  it('respects the limit', () => {
    expect(topBadCategories(rows, 'full', 1)).toHaveLength(1);
  });
});

describe('topBadAgents', () => {
  it('ranks agents by bad ratings and keeps their top three categories', () => {
    const rows = [
      agent('a', [], { csatScFullCount: 20, csatScBadScoreFullCount: 5, csatScCategoriesFull: { A: 3, B: 2, C: 1, D: 1 } }),
      agent('b', [], { csatScFullCount: 20, csatScBadScoreFullCount: 9, csatScCategoriesFull: { Z: 9 } }),
      agent('c', [], { csatScFullCount: 20, csatScBadScoreFullCount: 0 }),
    ];
    const top = topBadAgents(rows, 'full', 5);
    expect(top.map((t) => t.csId)).toEqual(['b', 'a']);
    expect(top[1].topCategories.map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });
});
