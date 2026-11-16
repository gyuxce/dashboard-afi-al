import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import {
  agentRoomPct,
  aggregateCategories,
  buildAgentRankings,
  buildRoomHighlights,
  buildScoreDistribution,
  buildScoreTopAgents,
  buildScoreTopCases,
  filterRoomAgents,
  getScoresForSelectedCase,
  scoreCaseLabel,
  sortRoomAgents,
  sortRoomDefectAgents,
  surveyResponseRate,
  topCategoryList,
} from '../csatRoomStats';

const TAKEOUT = 'Pengajuan limit kredit ditolak';

const agent = (csId: string, over: Record<string, unknown> = {}): AgentKPI =>
  ({
    csId, name: csId.toUpperCase(), bpo: 'NSI', teamLeader: 'TL',
    csatScFullCount: 10, csatScFairCount: 8,
    csatScTotalValid: 10, csatScGoodCount: 8, csatScFairTotalValid: 8, csatScFairGoodCount: 7,
    csatScFull: 80, csatScFair: 87.5,
    csatScBadScoreFullCount: 0, csatScBadScoreFairCount: 0,
    csatScCategoriesFull: {}, csatScCategoriesFair: {},
    csatScScoreDistribution: {},
    csatHistory: [],
    dailyHistory: {},
    ...over,
  }) as unknown as AgentKPI;

describe('agentRoomPct and filterRoomAgents', () => {
  it('computes good over valid per basis, null without valid ratings', () => {
    const a = agent('a');
    expect(agentRoomPct(a, 'full')).toBe(80);
    expect(agentRoomPct(a, 'fair')).toBe(87.5);
    expect(agentRoomPct(agent('b', { csatScTotalValid: 0 }), 'full')).toBeNull();
  });

  it('keeps agents that have surveys in the chosen basis, matching search and TL', () => {
    const data = [agent('a'), agent('b', { csatScFairCount: 0 }), agent('c', { csatScFullCount: 0, teamLeader: 'Aufar' })];
    expect(filterRoomAgents(data, '', null, 'full').map((x) => x.csId)).toEqual(['a', 'b']);
    expect(filterRoomAgents(data, '', null, 'fair').map((x) => x.csId)).toEqual(['a', 'c']);
    expect(filterRoomAgents(data, 'B', null, 'full').map((x) => x.csId)).toEqual(['b']);
    expect(filterRoomAgents(data, '', 'Aufar', 'fair').map((x) => x.csId)).toEqual(['c']);
  });
});

describe('categories', () => {
  const data = [
    agent('a', { csatScCategoriesFull: { Saldo: 5, Limit: 2 }, csatScCategoriesFair: { Saldo: 4 } }),
    agent('b', { csatScCategoriesFull: { Saldo: 1, Promo: 3 }, csatScCategoriesFair: { Promo: 1 } }),
  ];

  it('sums per category by basis', () => {
    expect(aggregateCategories(data, 'full')).toEqual({ Saldo: 6, Limit: 2, Promo: 3 });
    expect(aggregateCategories(data, 'fair')).toEqual({ Saldo: 4, Promo: 1 });
  });

  it('ranks the top categories from 1', () => {
    expect(topCategoryList(data, 'full')).toEqual([
      { rank: 1, name: 'Saldo', count: 6 },
      { rank: 2, name: 'Promo', count: 3 },
      { rank: 3, name: 'Limit', count: 2 },
    ]);
  });

  it('keeps at most ten', () => {
    const many = agent('m', { csatScCategoriesFull: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`c${i}`, i + 1])) });
    expect(topCategoryList([many], 'full')).toHaveLength(10);
  });
});

describe('buildRoomHighlights', () => {
  const day = (date: string, score: number, count: number) => ({ date, normDate: date, score, count });
  const a = agent('a', { dailyHistory: { csatScFull: [day('2026-10-01', 9, 10), day('2026-10-02', 5, 10)] }, csatScCategoriesFull: { Saldo: 3 } });
  const b = agent('b', { csatScGoodCount: 5, dailyHistory: { csatScFull: [day('2026-10-01', 1, 10)] }, csatScCategoriesFull: { Saldo: 1, Promo: 1 } });
  const h = buildRoomHighlights([a, b], 'full');

  it('ranks categories, agents by percent, and days from lowest', () => {
    expect(h.topCategories[0]).toEqual({ label: 'Saldo', value: '4' });
    expect(h.topAgents.map((x) => x.label)).toEqual(['A', 'B']);
    expect(h.topAgents[0].value).toBe('80,0%');
    expect(h.bottomAgents).toEqual([]);
    expect(h.bottomDays[0]).toEqual({ label: '2026-10-01', subLabel: '20 rating', value: '50,0%' });
    expect(h.bottomDays[1].value).toBe('50,0%');
  });

  it('skips agents without a percentage', () => {
    const none = agent('n', { csatScTotalValid: 0 });
    expect(buildRoomHighlights([none], 'full').topAgents).toEqual([]);
  });
});

describe('buildAgentRankings', () => {
  const data = [agent('c', { csatScBadScoreFullCount: 3 }), agent('a', { csatScBadScoreFullCount: 1 }), agent('b'), agent('d')];

  it('lists critical agents (most bad scores, none with zero) and stable ones (fewest, ties by name)', () => {
    const r = buildAgentRankings(data, 'full');
    expect(r.critical.map((x) => x.csId)).toEqual(['c', 'a']);
    expect(r.stable.map((x) => x.csId)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('score distribution', () => {
  const a = agent('a', {
    csatScScoreDistribution: { '1': { Saldo: 2, [TAKEOUT]: 1 }, '5': { Saldo: 4 }, 'No Survey': { Saldo: 4 }, '3': { Promo: 1 } },
  });
  const b = agent('b', { csatScScoreDistribution: { '2': { Promo: 3 }, '4': { Promo: 2 } } });

  it('counts per score with Bad = 1 + 2 and Good = 4 + 5', () => {
    const d = buildScoreDistribution([a, b], 'full');
    expect(d).toMatchObject({ All: 17, 'No Survey': 4, '1': 3, '2': 3, '3': 1, '4': 2, '5': 4, Bad: 6, Good: 6 });
  });

  it('drops takeout categories in fair mode', () => {
    const d = buildScoreDistribution([a, b], 'fair');
    expect(d['1']).toBe(2);
    expect(d.All).toBe(16);
  });

  it('response rate = answered (1 to 5) over everything including No Survey', () => {
    const r = surveyResponseRate(buildScoreDistribution([a, b], 'full'));
    expect(r).toEqual({ total: 17, answered: 13, rate: (13 / 17) * 100 });
    expect(surveyResponseRate(buildScoreDistribution([], 'full')).rate).toBe(0);
  });

  it('maps a selected case to its score keys and label', () => {
    expect(getScoresForSelectedCase('All')).toEqual(['No Survey', '1', '2', '3', '4', '5']);
    expect(getScoresForSelectedCase('Bad')).toEqual(['1', '2']);
    expect(getScoresForSelectedCase('Good')).toEqual(['4', '5']);
    expect(getScoresForSelectedCase('3')).toEqual(['3']);
    expect(scoreCaseLabel('Bad')).toBe('Bad Survey (Score 1 + 2)');
    expect(scoreCaseLabel('3')).toBe('Score 3');
  });

  it('ranks categories and agents inside a score group, with the split per score', () => {
    const cases = buildScoreTopCases([a, b], 'Bad', 'full');
    expect(cases[0]).toEqual({ rank: 1, name: 'Promo', count: 3, byScore: { '2': 3 } });
    expect(cases[1]).toEqual({ rank: 2, name: 'Saldo', count: 2, byScore: { '1': 2 } });
    expect(cases.find((c) => c.name === TAKEOUT)?.count).toBe(1);
    expect(buildScoreTopCases([a, b], 'Bad', 'fair').some((c) => c.name === TAKEOUT)).toBe(false);

    const agents = buildScoreTopAgents([a, b], 'Bad', 'full');
    expect(agents.map((x) => [x.name, x.count])).toEqual([['A', 3], ['B', 3]]);
    expect(agents[0].byScore).toEqual({ '1': 3 });
    expect(agents[1].byScore).toEqual({ '2': 3 });
  });
});

describe('sorting', () => {
  const list = [agent('b', { csatScFull: 70, csatScBadScoreFullCount: 1 }), agent('a', { csatScFull: 90, csatScBadScoreFullCount: 3 }), agent('c', { csatScFull: null, csatScBadScoreFullCount: 0 })];

  it('agents: input order by default, by average treating null as -1', () => {
    expect(sortRoomAgents(list, null, 'full').map((x) => x.csId)).toEqual(['b', 'a', 'c']);
    expect(sortRoomAgents(list, { key: 'average', direction: 'desc' }, 'full').map((x) => x.csId)).toEqual(['a', 'b', 'c']);
    expect(sortRoomAgents(list, { key: 'name', direction: 'asc' }, 'full').map((x) => x.csId)).toEqual(['a', 'b', 'c']);
  });

  it('defect: only agents with bad scores, most first, or by chosen column', () => {
    expect(sortRoomDefectAgents(list, null, 'full').map((x) => x.csId)).toEqual(['a', 'b']);
    expect(sortRoomDefectAgents(list, { key: 'name', direction: 'desc' }, 'full').map((x) => x.csId)).toEqual(['b', 'a']);
  });

  it('defect: per-score column counts history rows and Fair ignores takeout rows', () => {
    const h = (score: number, isTakeout = false) => ({ score, isTakeout });
    const x = agent('x', { csatScBadScoreFullCount: 2, csatScBadScoreFairCount: 1, csatHistory: [h(1), h(1, true)] });
    const y = agent('y', { csatScBadScoreFullCount: 1, csatScBadScoreFairCount: 1, csatHistory: [h(1)] });
    expect(sortRoomDefectAgents([y, x], { key: 'score1', direction: 'desc' }, 'full').map((z) => z.csId)).toEqual(['x', 'y']);
    // Fair: x has one non-takeout score-1 row, y has one: tie keeps input order.
    expect(sortRoomDefectAgents([y, x], { key: 'score1', direction: 'desc' }, 'fair').map((z) => z.csId)).toEqual(['y', 'x']);
  });
});
