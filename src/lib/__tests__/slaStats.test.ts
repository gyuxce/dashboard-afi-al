import { describe, expect, it } from 'vitest';
import type { AgentKPI } from '../dataProcessor';
import { KPI_TARGETS } from '../utils';
import { SLA_VIEWS, filterSlaAgents, sortSlaAgents } from '../slaStats';

const agent = (csId: string, sla1m: number | null, sla3m: number | null, whu: number | null, extra: Record<string, unknown> = {}) =>
  ({ csId, name: csId.toUpperCase(), bpo: 'NSI', teamLeader: 'TL', sla1m, sla3m, whu, dailyHistory: {}, ...extra }) as unknown as AgentKPI;

const data = [agent('b', 90, 95, null), agent('a', 97, null, 99), agent('c', null, 98, 94)];

describe('SLA_VIEWS', () => {
  it('uses the same targets as KPI_TARGETS', () => {
    for (const v of Object.values(SLA_VIEWS)) expect(v.target).toBe(KPI_TARGETS[v.type]);
  });
});

describe('filterSlaAgents', () => {
  it('keeps only agents that have a value for the chosen metric', () => {
    expect(filterSlaAgents(data, '', null, SLA_VIEWS['1m']).map((a) => a.csId)).toEqual(['b', 'a']);
    expect(filterSlaAgents(data, '', null, SLA_VIEWS['3m']).map((a) => a.csId)).toEqual(['b', 'c']);
    expect(filterSlaAgents(data, '', null, SLA_VIEWS.whu).map((a) => a.csId)).toEqual(['a', 'c']);
  });

  it('keeps a zero value (0% is data, not missing)', () => {
    expect(filterSlaAgents([agent('z', 0, null, null)], '', null, SLA_VIEWS['1m'])).toHaveLength(1);
  });

  it('matches search on id or name and filters by TL', () => {
    expect(filterSlaAgents(data, 'A', null, SLA_VIEWS['1m']).map((a) => a.csId)).toEqual(['a']);
    expect(filterSlaAgents([agent('x', 1, 1, 1, { teamLeader: 'Aufar' }), agent('y', 1, 1, 1)], '', 'Aufar', SLA_VIEWS['1m']).map((a) => a.csId)).toEqual(['x']);
  });
});

describe('sortSlaAgents', () => {
  const rows = filterSlaAgents(data, '', null, SLA_VIEWS['1m']);

  it('keeps input order without a sort column', () => {
    expect(sortSlaAgents(rows, null, SLA_VIEWS['1m']).map((a) => a.csId)).toEqual(['b', 'a']);
  });

  it('sorts by the metric of the chosen view, both directions', () => {
    expect(sortSlaAgents(rows, { key: 'average', direction: 'asc' }, SLA_VIEWS['1m']).map((a) => a.csId)).toEqual(['b', 'a']);
    expect(sortSlaAgents(rows, { key: 'average', direction: 'desc' }, SLA_VIEWS['1m']).map((a) => a.csId)).toEqual(['a', 'b']);
  });

  it('sorts by name and does not mutate the input', () => {
    expect(sortSlaAgents(rows, { key: 'name', direction: 'asc' }, SLA_VIEWS['1m']).map((a) => a.csId)).toEqual(['a', 'b']);
    expect(rows.map((a) => a.csId)).toEqual(['b', 'a']);
  });
});
