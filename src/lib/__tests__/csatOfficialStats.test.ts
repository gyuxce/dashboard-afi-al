import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import { buildOfficialHighlights, filterOfficialAgents, sortOfficialAgents } from '../csatOfficialStats';

const agent = (csId: string, csatAsli: number | null, extra: Record<string, unknown> = {}): AgentKPI =>
  ({
    csId, name: csId.toUpperCase(), bpo: 'NSI', teamLeader: 'TL', csatAsli,
    csat1Count: 0, csat2Count: 0, csat3Count: 0, csat4Count: 0, csat5Count: 0, csatRespondents: 0,
    dailyHistory: { csat: [] },
    ...extra,
  }) as unknown as AgentKPI;

describe('filterOfficialAgents', () => {
  const data = [agent('a1', 4), agent('b2', null), agent('c3', 3)];

  it('drops agents without an official CSAT', () => {
    expect(filterOfficialAgents(data, '', null).map((a) => a.csId)).toEqual(['a1', 'c3']);
  });

  it('matches CS ID or name, case-insensitively', () => {
    expect(filterOfficialAgents(data, 'A1', null).map((a) => a.csId)).toEqual(['a1']);
    expect(filterOfficialAgents(data, 'c3', null).map((a) => a.csId)).toEqual(['c3']);
  });

  it('filters by team leader when one is chosen', () => {
    expect(filterOfficialAgents([agent('x', 4, { teamLeader: 'Aufar' }), agent('y', 4, { teamLeader: 'Agra' })], '', 'Aufar').map((a) => a.csId)).toEqual(['x']);
  });
});

describe('sortOfficialAgents', () => {
  const list = [agent('b', 3.9), agent('a', 3.2), agent('c', 4.1)];

  it('keeps the input order without a sort column', () => {
    expect(sortOfficialAgents(list, null).map((a) => a.csId)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by average in both directions and by name', () => {
    expect(sortOfficialAgents(list, { key: 'average', direction: 'asc' }).map((a) => a.csId)).toEqual(['a', 'b', 'c']);
    expect(sortOfficialAgents(list, { key: 'average', direction: 'desc' }).map((a) => a.csId)).toEqual(['c', 'b', 'a']);
    expect(sortOfficialAgents(list, { key: 'name', direction: 'asc' }).map((a) => a.csId)).toEqual(['a', 'b', 'c']);
  });
});

describe('buildOfficialHighlights', () => {
  it('lists the best three and worst three agents, worst last-to-first', () => {
    const agents = [4.5, 4.2, 4.0, 3.8, 3.5, 3.3, 3.0].map((s, i) => agent(`a${i}`, s));
    const h = buildOfficialHighlights(agents);
    expect(h.topAgents.map((a) => a.label)).toEqual(['A0', 'A1', 'A2']);
    expect(h.bottomAgents.map((a) => a.label)).toEqual(['A6', 'A5', 'A4']);
    expect(h.topAgents[0].value).toBe('4,50 / 5');
  });

  it('leaves the bottom list empty when there are three agents or fewer', () => {
    expect(buildOfficialHighlights([agent('a', 4), agent('b', 3)]).bottomAgents).toEqual([]);
  });

  it('averages respondents per day across agents and ranks days by score', () => {
    const csat = (date: string, value: number, count: number) => ({ date, normDate: date, value, count, sum: value * count });
    const a = agent('a', 4, { dailyHistory: { csat: [csat('2026-10-01', 4, 10), csat('2026-10-02', 4, 10)] } });
    const b = agent('b', 4, { dailyHistory: { csat: [csat('2026-10-01', 2, 10)] } });
    const h = buildOfficialHighlights([a, b]);
    expect(h.topDays[0]).toEqual({ label: '2 Okt', subLabel: '10 responden', value: '4,00 / 5' });
    expect(h.topDays[1]).toEqual({ label: '1 Okt', subLabel: '20 responden', value: '3,00 / 5' });
  });

  it('reports the team score from star counts', () => {
    const a = agent('a', 4, { csat5Count: 2, csat4Count: 2, csatRespondents: 4 });
    expect(buildOfficialHighlights([a]).aggregate).toMatchObject({ points: 18, respondents: 4, score: 4.5 });
  });
});
