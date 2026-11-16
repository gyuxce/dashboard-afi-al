import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import { buildRcaStats, filterRcaAgents, hasRcaData } from '../csatRcaStats';

const agent = (csId: string, over: Record<string, unknown> = {}): AgentKPI =>
  ({
    csId, name: csId.toUpperCase(), teamLeader: 'Aufar',
    rcaAgentAreaCounts: {}, rcaCustomerAreaCounts: {}, rcaAkulakuProcessCounts: {},
    csatHistory: [],
    ...over,
  }) as unknown as AgentKPI;

const a = agent('a', {
  rcaAgentAreaCounts: { 'Salah info': 3, Typo: 1 },
  rcaCustomerAreaCounts: { 'Tidak paham': 2 },
  csatHistory: [
    { rcaAgent: 'Salah info', category: 'Limit' },
    { rcaAgent: 'Salah info', category: 'Limit' },
    { rcaAgent: 'Salah info', category: '' },
    { rcaAgent: '  ', category: 'Limit' },
    { rcaCustomer: 'Tidak paham', category: 'Promo' },
  ],
});
const b = agent('b', { teamLeader: 'Agra', rcaAgentAreaCounts: { 'Salah info': 2 }, rcaAkulakuProcessCounts: { Sistem: 4 } });

describe('hasRcaData', () => {
  it('is true when any agent has any RCA count', () => {
    expect(hasRcaData([agent('x')])).toBe(false);
    expect(hasRcaData([agent('x'), b])).toBe(true);
    expect(hasRcaData([])).toBe(false);
  });
});

describe('buildRcaStats', () => {
  const s = buildRcaStats([a, b]);

  it('totals each area', () => {
    expect([s.totalAgent, s.totalCustomer, s.totalAkulaku]).toEqual([6, 2, 4]);
  });

  it('lists the top issues per area as bars, biggest first', () => {
    expect(s.agentDetailBar).toEqual([{ name: 'Salah info', count: 5 }, { name: 'Typo', count: 1 }]);
    expect(s.akulakuDetailBar).toEqual([{ name: 'Sistem', count: 4 }]);
  });

  it('keeps at most eight bars and five issues', () => {
    const many = agent('m', { rcaAgentAreaCounts: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`i${i}`, 10 - i])) });
    const r = buildRcaStats([many]);
    expect(r.agentDetailBar).toHaveLength(8);
    expect(r.agentIssueCategories).toHaveLength(5);
  });

  it('attaches the top case categories per issue, "Unknown Case" for blanks, ignoring blank issues', () => {
    const [top] = s.agentIssueCategories;
    expect(top.issue).toBe('Salah info');
    expect(top.count).toBe(5);
    expect(top.categories).toEqual([{ name: 'Limit', count: 2 }, { name: 'Unknown Case', count: 1 }]);
    expect(s.customerIssueCategories[0].categories).toEqual([{ name: 'Promo', count: 1 }]);
  });

  it('ranks agents by total cases and drops agents without cases', () => {
    const r = buildRcaStats([a, b, agent('z')]);
    expect(r.agentRanking.map((x) => [x.name, x.total])).toEqual([['A', 6], ['B', 6]]);
    expect(r.agentRanking[0]).toMatchObject({ agentCases: 4, customerCases: 2, akulakuCases: 0, tl: 'Aufar' });
  });
});

describe('filterRcaAgents', () => {
  const rows = buildRcaStats([a, b]).agentRanking;

  it('keeps everything on a blank search and matches name or TL otherwise', () => {
    expect(filterRcaAgents(rows, '  ')).toBe(rows);
    expect(filterRcaAgents(rows, 'agra').map((r) => r.name)).toEqual(['B']);
    expect(filterRcaAgents(rows, 'A').length).toBeGreaterThan(0);
  });
});
